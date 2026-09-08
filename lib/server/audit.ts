import { store } from "./store";
import type { AuditRecord } from "./store";
import { access } from "./workspace";
import { AppError } from "./validation";
import type { Account } from "@/types/workspace";

export interface ActivityEntry {
  id: string;
  action: string;
  subject: string | null;
  userId: string | null;
  userName: string;
  createdAt: string;
}

export const ACTIVITY_LIMIT = 200;

/**
 * The audit trail, which every mutation has always written and nothing could
 * read. Managers see their own organisation's history; nobody sees another's.
 */
export async function activity(
  user: Account,
  orgId: string,
  limit = ACTIVITY_LIMIT,
): Promise<ActivityEntry[]> {
  const membership = await access(user, orgId);
  if (membership.role !== "manager")
    throw new AppError("A manager account is required.", 403);
  const rows = await store().find<AuditRecord>("audit", {
    where: [["orgId", "==", orgId]],
    orderBy: [{ field: "createdAt", direction: "desc" }],
    limit: Math.min(Math.max(1, Math.floor(limit)), ACTIVITY_LIMIT),
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    subject: row.subject ?? null,
    userId: row.userId,
    userName: row.userName || "",
    createdAt: row.createdAt,
  }));
}

/**
 * Retention. The trail is evidence for access disputes, not an archive: keep a
 * bounded window so a long-lived tenant does not accumulate indefinitely.
 */
export const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 400);

export async function pruneAudit(days = RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return store().removeWhere("audit", {
    where: [["createdAt", "<", cutoff]],
  });
}
