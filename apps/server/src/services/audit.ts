import type { DBorTx } from "../db/client";
import { auditLog } from "../db/schema";

export interface AuditEntry {
  actorUserId?: string | null;
  actorKind: "human" | "fte" | "system";
  action: string;
  entity?: string;
  entityId?: string | null;
  summary: string;
  data?: unknown;
  conversationId?: string | null;
  fteRunId?: string | null;
}

/** Write one audit row. Call it with the same transaction handle as the change it records. */
export async function audit(tx: DBorTx, e: AuditEntry) {
  await tx.insert(auditLog).values({
    actorUserId: e.actorUserId ?? null,
    actorKind: e.actorKind,
    action: e.action,
    entity: e.entity ?? null,
    entityId: e.entityId ?? null,
    summary: e.summary.slice(0, 500),
    data: (e.data ?? null) as never,
    conversationId: e.conversationId ?? null,
    fteRunId: e.fteRunId ?? null,
  });
}
