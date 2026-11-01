import { Router, type Request } from "express";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { formatUsd } from "@autofte/shared";
import { db } from "../db/client";
import * as s from "../db/schema";
import { bad, forbidden, h, notFound, parse } from "../lib/http";
import { requireAuth } from "../auth/session";
import { audit } from "../services/audit";
import { ensureCustomerConversation, postMessage } from "../services/chat";
import { notify, usersWithPerm } from "../services/notify";
import { listVehicles } from "../services/website";

/**
 * The shop: wishlist, cart and checkout (an order REQUEST — payment is by bank transfer after staff confirm).
 * Used by the website and the app with the same account. Prices are always read from the vehicle at the
 * moment of checkout and copied onto the order lines, so a later price change never rewrites an order.
 */
export const shopRouter = Router();

const MAX_CART = 10;

/** Buyers only: customers, and chat visitors (who become customers with the same row when they register). */
function buyer(req: Request) {
  const u = requireAuth(req);
  if (u.kind !== "customer" && u.kind !== "visitor") throw forbidden("Staff accounts cannot shop — sign in with a customer account");
  return u;
}

/** Vehicle cards for these ids, in the given order (sold/reserved included so the buyer sees why). */
async function cardsFor(ids: string[]) {
  if (!ids.length) return [];
  const { items } = await listVehicles({ ids, status: "all", limit: ids.length });
  const byId = new Map(items.map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => !!v);
}

const price = (v: { priceUsd: number; discountPriceUsd: number | null }) => Number(v.discountPriceUsd ?? v.priceUsd);

async function assertShowable(vehicleId: string) {
  const [v] = await db().select({ id: s.vehicles.id, status: s.vehicles.status, published: s.vehicles.published }).from(s.vehicles).where(eq(s.vehicles.id, vehicleId)).limit(1);
  if (!v || !v.published) throw notFound("This vehicle is not available");
  return v;
}

shopRouter.get(
  "/counts",
  h(async (req) => {
    if (!req.user || (req.user.kind !== "customer" && req.user.kind !== "visitor")) return { cart: 0, wishlist: 0 };
    const uid = req.user.id;
    const [[c], [w]] = await Promise.all([
      db().select({ n: sql<number>`count(*)::int` }).from(s.cartItems).where(eq(s.cartItems.userId, uid)),
      db().select({ n: sql<number>`count(*)::int` }).from(s.wishlistItems).where(eq(s.wishlistItems.userId, uid)),
    ]);
    return { cart: c?.n ?? 0, wishlist: w?.n ?? 0 };
  }),
);

// ---------- wishlist ----------
shopRouter.get(
  "/wishlist",
  h(async (req) => {
    const u = buyer(req);
    const rows = await db().select({ id: s.wishlistItems.vehicleId }).from(s.wishlistItems).where(eq(s.wishlistItems.userId, u.id)).orderBy(desc(s.wishlistItems.createdAt));
    return { items: await cardsFor(rows.map((r) => r.id)) };
  }),
);

const vehicleRef = z.object({ vehicleId: z.string().min(1).max(40) });

shopRouter.post(
  "/wishlist",
  h(async (req) => {
    const u = buyer(req);
    const { vehicleId } = parse(vehicleRef, req.body);
    await assertShowable(vehicleId);
    await db().insert(s.wishlistItems).values({ userId: u.id, vehicleId }).onConflictDoNothing();
    return { ok: true };
  }),
);

shopRouter.delete(
  "/wishlist/:vehicleId",
  h(async (req) => {
    const u = buyer(req);
    await db().delete(s.wishlistItems).where(and(eq(s.wishlistItems.userId, u.id), eq(s.wishlistItems.vehicleId, String(req.params.vehicleId))));
    return { ok: true };
  }),
);

// ---------- cart ----------
async function cartFor(userId: string) {
  const rows = await db().select({ id: s.cartItems.vehicleId }).from(s.cartItems).where(eq(s.cartItems.userId, userId)).orderBy(asc(s.cartItems.createdAt));
  const items = await cardsFor(rows.map((r) => r.id));
  const ready = items.filter((v) => v.status === "available");
  return { items, totalUsd: ready.reduce((t, v) => t + price(v), 0), readyCount: ready.length };
}

shopRouter.get(
  "/cart",
  h(async (req) => cartFor(buyer(req).id)),
);

shopRouter.post(
  "/cart",
  h(async (req) => {
    const u = buyer(req);
    const { vehicleId } = parse(vehicleRef, req.body);
    const v = await assertShowable(vehicleId);
    if (v.status !== "available") throw bad(v.status === "sold" ? "This car has been sold" : "This car is reserved by another buyer");
    const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(s.cartItems).where(eq(s.cartItems.userId, u.id))) as [{ n: number }];
    if (n >= MAX_CART) throw bad(`A cart can hold up to ${MAX_CART} cars`);
    await db().insert(s.cartItems).values({ userId: u.id, vehicleId }).onConflictDoNothing();
    return { ok: true };
  }),
);

shopRouter.delete(
  "/cart/:vehicleId",
  h(async (req) => {
    const u = buyer(req);
    await db().delete(s.cartItems).where(and(eq(s.cartItems.userId, u.id), eq(s.cartItems.vehicleId, String(req.params.vehicleId))));
    return { ok: true };
  }),
);

// ---------- checkout → order request ----------
async function newOrderNo(): Promise<string> {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I: read out over the phone
  for (let i = 0; i < 20; i++) {
    const code = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
    const no = `ORD-${year}-${code}`;
    const [hit] = await db().select({ id: s.webOrders.id }).from(s.webOrders).where(eq(s.webOrders.orderNo, no)).limit(1);
    if (!hit) return no;
  }
  throw new Error("could not allocate an order number");
}

shopRouter.post(
  "/checkout",
  h(async (req) => {
    const u = buyer(req);
    const { notes } = parse(z.object({ notes: z.string().trim().max(1000).optional() }), req.body ?? {});
    const cart = await cartFor(u.id);
    const ready = cart.items.filter((v) => v.status === "available");
    if (!ready.length) throw bad(cart.items.length ? "None of the cars in your cart is still available" : "Your cart is empty");
    const orderNo = await newOrderNo();
    const conv = await ensureCustomerConversation(u.id, "web");
    const total = ready.reduce((t, v) => t + price(v), 0);
    const order = await db().transaction(async (tx) => {
      const [o] = await tx.insert(s.webOrders).values({ orderNo, userId: u.id, status: "pending", paymentMethod: "Order request", totalUsd: total, notes: notes || null }).returning();
      await tx.insert(s.webOrderItems).values(ready.map((v) => ({ orderId: o!.id, vehicleId: v.id, title: `${v.title} (${v.stockNo})`, priceUsd: price(v) })));
      await tx.delete(s.cartItems).where(and(eq(s.cartItems.userId, u.id), inArray(s.cartItems.vehicleId, ready.map((v) => v.id))));
      await audit(tx, { actorUserId: u.id, actorKind: "human", action: "web_order.created", entity: "web_order", entityId: o!.id, summary: `Order request ${orderNo}: ${ready.length} car(s), ${formatUsd(total)}`, conversationId: conv.id });
      return o!;
    });
    // After the commit, never inside it: postMessage looks up recipients with db(), and PGlite has ONE
    // connection — a db() call inside db().transaction() waits for itself forever.
    // The same thread on the website, the app and the desk, so everyone (and Sora) sees the request.
    await postMessage({
      conversationId: conv.id,
      senderUserId: null,
      kind: "system",
      body: `Order request ${orderNo} received: ${ready.map((v) => `${v.title} (${v.stockNo})`).join(", ")} — ${formatUsd(total)} FOB. A colleague will confirm availability and send the invoice with bank details.`,
      meta: { webOrderId: order.id, orderNo },
    }).catch((e) => console.error("[checkout] chat note failed", e));
    await notify(await usersWithPerm("website.orders.manage"), { type: "order", title: `New order request ${orderNo}`, body: `${u.name} · ${ready.length} car(s) · ${formatUsd(total)}`, link: "/admin/orders" });
    return { orderId: order.id, orderNo, totalUsd: total, items: ready.length };
  }),
);

// ---------- my orders ----------
async function ordersWithItems(where: SQL | undefined) {
  const orders = await db().select().from(s.webOrders).where(where).orderBy(desc(s.webOrders.createdAt)).limit(100);
  if (!orders.length) return [];
  const items = await db()
    .select({ orderId: s.webOrderItems.orderId, vehicleId: s.webOrderItems.vehicleId, title: s.webOrderItems.title, priceUsd: s.webOrderItems.priceUsd, slug: s.vehicles.slug })
    .from(s.webOrderItems)
    .leftJoin(s.vehicles, eq(s.vehicles.id, s.webOrderItems.vehicleId))
    .where(inArray(s.webOrderItems.orderId, orders.map((o) => o.id)));
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

shopRouter.get(
  "/orders",
  h(async (req) => ({ items: await ordersWithItems(eq(s.webOrders.userId, buyer(req).id)) })),
);

shopRouter.get(
  "/orders/:id",
  h(async (req) => {
    const u = buyer(req);
    const [o] = await ordersWithItems(and(eq(s.webOrders.id, String(req.params.id)), eq(s.webOrders.userId, u.id)));
    if (!o) throw notFound("Order not found");
    return o;
  }),
);
