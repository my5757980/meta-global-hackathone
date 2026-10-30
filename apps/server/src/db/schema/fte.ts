import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { genId } from "../../lib/id";
import { users } from "./platform";

const id = () => text().primaryKey().$defaultFn(genId);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const fteRuns = pgTable(
  "fte_runs",
  {
    id: id(),
    trigger: text().notNull(), // message | event | approval | eval
    conversationId: text(),
    eventId: text(),
    status: text().notNull().default("running"), // running | ok | error | fallback | handover
    steps: integer().notNull().default(0),
    provider: text(),
    model: text(),
    promptTokens: integer().notNull().default(0),
    completionTokens: integer().notNull().default(0),
    latencyMs: integer(),
    firstReplyMs: integer(),
    toolCalls: jsonb().notNull().default([]), // [{name, args, ok, ms}]
    reasoningExcerpt: text(),
    error: text(),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("runs_conv_idx").on(t.conversationId, t.startedAt), index("runs_started_idx").on(t.startedAt)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    kind: text().notNull(), // discount | bid | other
    status: text().notNull().default("pending"),
    requestedBy: text().references(() => users.id),
    conversationId: text(),
    leadId: text(),
    lotId: text(),
    quoteId: text(),
    payload: jsonb().notNull(),
    reason: text().notNull(),
    decidedBy: text().references(() => users.id),
    decidedAt: timestamp({ withTimezone: true }),
    decisionNote: text(),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_status_idx").on(t.status, t.createdAt)],
);

export const buyerRequests = pgTable("buyer_requests", {
  id: id(),
  customerUserId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: text(),
  criteria: jsonb().notNull(),
  active: boolean().notNull().default(true),
  lastNotifiedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

export const evalRuns = pgTable("eval_runs", {
  id: id(),
  startedAt: createdAt(),
  finishedAt: timestamp({ withTimezone: true }),
  total: integer().notNull().default(0),
  passed: integer().notNull().default(0),
  provider: text(),
  model: text(),
  results: jsonb().notNull().default([]),
});
