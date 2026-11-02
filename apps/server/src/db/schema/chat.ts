import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { genId } from "../../lib/id";
import { users } from "./platform";

const id = () => text().primaryKey().$defaultFn(genId);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: id(),
    kind: text().notNull(), // customer | staff_dm | group
    title: text(),
    customerUserId: text().references(() => users.id),
    holder: text().notNull().default("fte"), // fte | human
    assignedUserId: text().references(() => users.id),
    fteSummary: text(),
    channel: text().notNull().default("web"), // web | app
    lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("conv_customer_idx").on(t.customerUserId), index("conv_last_idx").on(t.lastMessageAt)],
);

/** One row per phone with the app. A new sign-in on the same phone takes the token over. */
export const pushTokens = pgTable("push_tokens", {
  token: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text().notNull().default("android"),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const chatMembers = pgTable(
  "chat_members",
  {
    conversationId: text()
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().notNull().default("member"),
    lastReadAt: timestamp({ withTimezone: true }),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("members_user_idx").on(t.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    conversationId: text()
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    senderUserId: text().references(() => users.id),
    kind: text().notNull().default("text"),
    body: text().notNull().default(""),
    fileIds: jsonb().notNull().default([]),
    meta: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index("msg_conv_idx").on(t.conversationId, t.createdAt)],
);

export const chatCalls = pgTable(
  "chat_calls",
  {
    id: id(),
    conversationId: text()
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    callerId: text()
      .notNull()
      .references(() => users.id),
    calleeId: text()
      .notNull()
      .references(() => users.id),
    media: text().notNull().default("audio"),
    status: text().notNull().default("ringing"),
    startedAt: createdAt(),
    answeredAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("calls_conv_idx").on(t.conversationId)],
);
