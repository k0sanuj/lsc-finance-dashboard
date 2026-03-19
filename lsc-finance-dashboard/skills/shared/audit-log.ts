/**
 * Audit Log Skill
 *
 * Records before/after state for every mutation.
 * Used by cascade engine after every write operation.
 */

import type { CascadeTrigger } from "../../ontology/cascades";

export type AuditLogEntry = {
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  cascadeTriggered: boolean;
  cascadeDetails: { trigger: CascadeTrigger; actions: string[] } | null;
  performedBy: string | null;
  timestamp: Date;
};

/**
 * Write an audit log entry.
 * Currently a stub — will be wired to DB in security hardening phase.
 */
export async function writeAuditLog(entry: Omit<AuditLogEntry, "timestamp">): Promise<void> {
  const fullEntry: AuditLogEntry = {
    ...entry,
    timestamp: new Date(),
  };

  // TODO: Write to audit_log table via queryRows
  // For now, log to console in development
  if (process.env.NODE_ENV === "development") {
    console.log("[AUDIT]", fullEntry.action, fullEntry.entityType, fullEntry.entityId);
  }
}

/**
 * Query audit log entries for a specific entity.
 * Stub for now.
 */
export async function getAuditLog(
  entityType: string,
  entityId: string,
  _limit = 50
): Promise<AuditLogEntry[]> {
  // TODO: Query from audit_log table
  return [];
}
