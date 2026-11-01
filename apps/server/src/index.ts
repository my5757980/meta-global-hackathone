import express from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { env, isProd, webDist } from "./env";
import { db, dbKind, openDb, runMigrations } from "./db/client";
import { isSeeded, seedAll } from "./seed";
import { errorMiddleware, h, HttpError } from "./lib/http";
import { loadUser, requireAuth } from "./auth/session";
import { openStream } from "./services/sse";
import { startScheduler } from "./services/events";
import { publicRouter, mediaRouter } from "./routes/public";
import { authRouter } from "./routes/auth";
import { chatRouter } from "./routes/chat";
import { crmRouter } from "./routes/crm";
import { fteRouter } from "./routes/fte";
import { accountRouter } from "./routes/account";
import { crmOps } from "./routes/crmOps";
import { adminRouter } from "./routes/admin";
import { auctionRouter } from "./routes/auction";
import { mountMcp } from "./fte/mcp";
import { registerSoraHandlers } from "./fte/handlers";
import { loadSkills } from "./fte/skills";
import { modelConfigured, primaryModelName } from "./fte/model";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

async function main() {
  await openDb();
  await runMigrations();
  if (!(await isSeeded(db()))) {
    console.log("first start: loading demo data…");
    await seedAll(db(), (m) => console.log("  " + m));
  }
  loadSkills(true);
  registerSoraHandlers();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  mountMcp(app); // /mcp — bearer-token protected, before session handling

  app.use("/api", loadUser);
  app.use("/api/public", publicRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/crm", crmRouter);
  app.use("/api/crm", crmOps);
  app.use("/api/admin", adminRouter);
  app.use("/api/auction", auctionRouter);
  app.use("/api/fte", fteRouter);
  app.use("/api/account", accountRouter);

  app.get(
    "/api/stream",
    h(async (req, res) => {
      const u = requireAuth(req);
      await db().update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
      openStream(req, res, u.id);
      return undefined;
    }),
  );
  app.post(
    "/api/ping",
    h(async (req) => {
      if (req.user) await db().update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, req.user.id));
      return { ok: true };
    }),
  );
  app.get("/api/health", (_req, res) => res.json({ ok: true, db: dbKind(), model: modelConfigured() ? primaryModelName() : null }));
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No such API route")));

  // production: serve the built SPA from the same process
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: isProd ? "7d" : 0 }));
    app.get(/^(?!\/api|\/mcp).*/, (_req, res) => res.sendFile(resolve(webDist, "index.html")));
  }
  app.use(errorMiddleware);

  app.listen(env.PORT, () => {
    console.log(`AutoFTE API on http://localhost:${env.PORT} (db: ${dbKind()}, model: ${modelConfigured() ? primaryModelName() : "NOT configured"})`);
  });
  startScheduler();
  // auction days end on the (demo) clock: settle them now and every minute
  const { settleAuctions } = await import("./services/auction");
  const settle = () => void settleAuctions().catch((e) => console.error("[auction settle]", e));
  settle();
  setInterval(settle, 60_000).unref();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
