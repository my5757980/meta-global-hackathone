import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { genId } from "../../lib/id";

const id = () => text().primaryKey().$defaultFn(genId);
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const roles = pgTable("roles", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  isSystem: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const permissions = pgTable("permissions", {
  key: text().primaryKey(),
  area: text().notNull(),
  label: text().notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: text().notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text().notNull().references(() => permissions.key, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    kind: text().notNull(), // staff | customer | visitor | fte
    name: text().notNull(),
    email: text(),
    phone: text(),
    username: text(),
    passwordHash: text(),
    mustChangePassword: boolean().notNull().default(false), // set by a one-time password from staff
    resetTokenHash: text(), // a customer's reset link: only its hash is kept, it works once for an hour
    resetTokenExpiresAt: timestamp({ withTimezone: true }),
    recoveryKeyHash: text(), // staff's own recovery key (shown once), for a lost password with no e-mail server
    roleId: text().references(() => roles.id),
    isActive: boolean().notNull().default(true),
    language: text().notNull().default("en"),
    countryCode: text(),
    city: text(),
    address: text(),
    company: text(),
    avatarUrl: text(),
    title: text(), // staff job title shown in chat
    showInChat: boolean().notNull().default(true),
    lastSeenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email), uniqueIndex("users_username_uq").on(t.username), index("users_kind_idx").on(t.kind)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(), // sha256(token)
    userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorUserId: text(),
    actorKind: text().notNull(), // human | fte | system
    action: text().notNull(),
    entity: text(),
    entityId: text(),
    summary: text().notNull(),
    data: jsonb(),
    conversationId: text(),
    fteRunId: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_conv_idx").on(t.conversationId),
    index("audit_run_idx").on(t.fteRunId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text().notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    title: text().notNull(),
    body: text(),
    link: text(),
    data: jsonb(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.createdAt)],
);

export const files = pgTable("files", {
  id: id(),
  kind: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  path: text().notNull(),
  originalName: text(),
  ownerUserId: text(),
  createdAt: createdAt(),
});

export const events = pgTable(
  "events",
  {
    id: id(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    dueAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: text().notNull().default("pending"), // pending | done | failed | skipped
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: createdAt(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("events_due_idx").on(t.status, t.dueAt)],
);

export const mcpTokens = pgTable("mcp_tokens", {
  id: id(),
  name: text().notNull(),
  tokenHash: text().notNull().unique(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  revokedAt: timestamp({ withTimezone: true }),
});
