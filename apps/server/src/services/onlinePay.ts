import { randomBytes } from "node:crypto";
import { env } from "../env";

/**
 * Paying online at checkout. PayPal (Orders v2: create, then capture) when the company has its keys. Without keys a demo
 * has a stand-in that moves no money and says so on the page, so the flow after it can still be seen.
 */
export type PayProvider = "paypal" | "demo";
export const payProvider = (): PayProvider | null => (env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET ? "paypal" : env.DEMO_MODE ? "demo" : null);
export const payMethodName = (p: PayProvider) => (p === "paypal" ? "PayPal" : "Online (demo)");

async function paypalToken() {
  const r = await fetch(`${env.PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal sign-in failed (${r.status})`);
  return ((await r.json()) as { access_token: string }).access_token;
}

export async function createPayment(o: { orderNo: string; amountUsd: number; returnUrl: string; cancelUrl: string; brand: string }): Promise<{ ref: string; approveUrl: string | null }> {
  if (payProvider() !== "paypal") return { ref: `DEMO-${randomBytes(6).toString("hex").toUpperCase()}`, approveUrl: null };
  const r = await fetch(`${env.PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await paypalToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: o.orderNo, description: `Order ${o.orderNo}`, amount: { currency_code: "USD", value: o.amountUsd.toFixed(2) } }],
      application_context: { brand_name: o.brand, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: o.returnUrl, cancel_url: o.cancelUrl },
    }),
  });
  if (!r.ok) throw new Error(`PayPal would not start the payment (${r.status})`);
  const j = (await r.json()) as { id: string; links?: { rel: string; href: string }[] };
  const approveUrl = j.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  if (!approveUrl) throw new Error("PayPal sent no page to approve the payment on");
  return { ref: j.id, approveUrl };
}

/** Takes the money. A payment only counts when the provider says COMPLETED, for the amount it should be. */
export async function capturePayment(ref: string, expectedUsd: number): Promise<{ completed: boolean; amountUsd: number; detail: string }> {
  if (ref.startsWith("DEMO-")) {
    if (payProvider() !== "demo") return { completed: false, amountUsd: 0, detail: "Demo payments are not accepted here" };
    return { completed: true, amountUsd: expectedUsd, detail: "demo" };
  }
  const r = await fetch(`${env.PAYPAL_BASE_URL}/v2/checkout/orders/${encodeURIComponent(ref)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${await paypalToken()}`, "Content-Type": "application/json" } });
  const j = (await r.json().catch(() => ({}))) as { status?: string; purchase_units?: { payments?: { captures?: { status?: string; amount?: { value?: string } }[] } }[] };
  const cap = j.purchase_units?.[0]?.payments?.captures?.[0];
  const amountUsd = Number(cap?.amount?.value ?? 0);
  const completed = r.ok && j.status === "COMPLETED" && Math.abs(amountUsd - expectedUsd) <= 0.01;
  return { completed, amountUsd, detail: completed ? "completed" : `PayPal says ${j.status ?? r.status}, for ${amountUsd}` };
}
