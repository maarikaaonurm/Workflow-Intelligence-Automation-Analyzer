import type { Prisma } from "@prisma/client";

export interface AuditEvent {
  organizationId: string;
  departmentId?: string | null;
  campaignId?: string | null;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Safe metadata only: ids, old/new values. Never secrets or sensitive payloads. */
  metadata?: Prisma.InputJsonValue;
}

/** Writes inside the caller's transaction so the audit row commits with the change. */
export async function writeAudit(tx: Prisma.TransactionClient, event: AuditEvent): Promise<void> {
  await tx.auditLog.create({ data: event });
}
