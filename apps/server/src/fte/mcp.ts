/**
 * The platform's MCP server (streamable HTTP, stateless) and Sora's MCP client.
 * Sora reaches the business ONLY through these tools. Each run gets a short-lived bearer token
 * bound to its conversation and buyer; external agents can use admin-issued tokens.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { eq, isNull, and } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { env } from "../env";
import { db } from "../db/client";
import { mcpTokens, users } from "../db/schema";
import { randomToken, sha256 } from "../lib/id";
import { TOOLS, runTool, type ToolCtx } from "./tools";
import { toolsOf } from "./workforce";

// ---------- run tokens (memory only) ----------
const runTokens = new Map<string, { ctx: ToolCtx; expires: number }>();

export function issueRunToken(ctx: ToolCtx, ttlMs = 5 * 60_000): string {
  const t = "run_" + randomToken(24);
  runTokens.set(t, { ctx, expires: Date.now() + ttlMs });
  return t;
}
export function revokeRunToken(t: string) {
  runTokens.delete(t);
}
setInterval(() => {
  const n = Date.now();
  for (const [k, v] of runTokens) if (v.expires < n) runTokens.delete(k);
}, 60_000).unref();

async function authMcp(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return void res.status(401).json({ error: "Bearer token required" });
  let ctx: ToolCtx | null = null;
  const rt = runTokens.get(token);
  if (rt && rt.expires > Date.now()) ctx = rt.ctx;
  if (!ctx) {
    const [row] = await db().select().from(mcpTokens).where(and(eq(mcpTokens.tokenHash, sha256(token)), isNull(mcpTokens.revokedAt))).limit(1);
    if (row) {
      const [u] = await db().select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (u?.isActive) ctx = { principalUserId: u.id, principalName: u.name, principalKind: u.kind === "fte" ? "fte" : "human" };
    }
  }
  if (!ctx) return void res.status(401).json({ error: "Invalid or expired token" });
  (req as Request & { auth?: unknown }).auth = { token, clientId: ctx.principalUserId, scopes: ["tools"], extra: ctx as unknown as Record<string, unknown> };
  next();
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "autofte-business-tools", version: "1.0.0" });
  for (const t of TOOLS) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.input as never }, (async (args: Record<string, unknown>, extra: { authInfo?: { extra?: Record<string, unknown> } }) => {
      const ctx = extra.authInfo?.extra as unknown as ToolCtx;
      const r = await runTool(t.name, args, ctx);
      return { content: [{ type: "text" as const, text: JSON.stringify(r.result) }], isError: !r.ok };
    }) as never);
  }
  return server;
}

export function mountMcp(app: Express) {
  app.post("/mcp", authMcp, async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[mcp]", e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });
  const notAllowed = (_req: Request, res: Response) => void res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)" }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}

// ---------- client side (Sora) ----------
let toolCache: ChatCompletionTool[] | null = null;

export interface McpSession {
  tools: ChatCompletionTool[];
  call(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }>;
  close(): Promise<void>;
}

export async function openMcpSession(ctx: ToolCtx): Promise<McpSession> {
  const token = issueRunToken(ctx);
  const open = async () => {
    const c = new Client({ name: "autofte-digital-fte", version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${env.PORT}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return c;
  };
  const client = await open().catch(() => open());
  if (!toolCache) {
    const listed = await client.listTools();
    toolCache = listed.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description ?? "", parameters: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown> } }));
  }
  const mine = toolsOf(ctx.workerKey);
  return {
    tools: toolCache.filter((t) => t.type === "function" && mine.includes(t.function.name)),
    async call(name, args) {
      try {
        const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 240_000 });
        const text = Array.isArray(r.content) ? r.content.map((c) => ("text" in c ? (c.text as string) : "")).join("\n") : "";
        return { ok: !r.isError, text };
      } catch {
        // a tool that did not answer is for the FTE to deal with, not the end of its job
        return { ok: false, text: JSON.stringify({ error: "This tool did not answer in time, and may or may not have finished. Check before repeating anything." }) };
      }
    },
    async close() {
      revokeRunToken(token);
      await client.close().catch(() => {});
    },
  };
}

/** Admin: issue a long-lived MCP token for an external agent acting as a given staff user. */
export async function createMcpToken(name: string, userId: string): Promise<string> {
  const token = "afte_" + randomToken(30);
  await db().insert(mcpTokens).values({ name, tokenHash: sha256(token), userId });
  return token;
}
