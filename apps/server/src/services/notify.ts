import { and, eq, inArray } from "drizzle-orm";
import type { PermissionKey } from "@autofte/shared";
import { db, type DBorTx } from "../db/client";
import { notifications, rolePermissions, users } from "../db/schema";
import { publish } from "./sse";

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: unknown;
}

export async function notify(userIds: string[], n: NotifyInput, tx: DBorTx = db()) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const rows = await tx
    .insert(notifications)
    .values(ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null, data: (n.data ?? null) as never })))
    .returning();
  for (const r of rows) publish([r.userId], "notification", r);
}

/** Active staff whose role has a permission (e.g. every Supervisor for invoice approvals). */
export async function usersWithPerm(perm: PermissionKey): Promise<string[]> {
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
    .where(and(eq(rolePermissions.permissionKey, perm), eq(users.isActive, true), inArray(users.kind, ["staff"])));
  return rows.map((r) => r.id);
}
