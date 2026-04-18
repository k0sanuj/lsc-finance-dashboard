/**
 * Audit Log Skill
 *
 * Records every mutation + cascade result to the audit_log table.
 * Called by cascade-update after every write operation.
 *
 * Schema: sql/028_audit_log.sql
 */

import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import type { CascadeTrigger } from "../../ontology/cascades";

export type AuditLogEntry = {
  id: string;
  entityType: string;
  entityId: string;
  trigger: string;
  action: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  cascadeResult: { actions: string[]; errors: Array<{ action: string; error: string }> } | null;
  performedBy: string | null;
  agentId: string | null;
  createdAt: Date;
};

export type WriteAuditLogInput = {
  entityType: string;
  entityId: string;
  trigger: CascadeTrigger | string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  cascadeResult?: { actions: string[]; errors: Array<{ action: string; error: string }> } | null;
  performedBy?: string | null;
  agentId?: string | null;
};

/**
 * Insert a new audit log row. Never throws — audit failures
 * must not break the mutation that called it.
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await executeAdmin(
      `insert into audit_log (
         entity_type, entity_id, trigger, action,
         before_state, after_state, cascade_result,
         performed_by, agent_id
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.entityType,
        input.entityId,
        input.trigger,
        input.action,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        input.cascadeResult ? JSON.stringify(input.cascadeResult) : null,
        input.performedBy ?? null,
        input.agentId ?? null,
      ]
    );
  } catch (err) {
    // Swallow — audit log failure must not kill the originating mutation.
    // Log to stderr so the operator can still see it.
    console.error(
      "[audit-log] failed to write entry:",
      err instanceof Error ? err.message : String(err),
      { entityType: input.entityType, entityId: input.entityId, trigger: input.trigger }
    );
  }
}

function rowToEntry(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    trigger: String(row.trigger),
    action: String(row.action),
    beforeState: (row.before_state as AuditLogEntry["beforeState"]) ?? null,
    afterState: (row.after_state as AuditLogEntry["afterState"]) ?? null,
    cascadeResult: (row.cascade_result as AuditLogEntry["cascadeResult"]) ?? null,
    performedBy: row.performed_by ? String(row.performed_by) : null,
    agentId: row.agent_id ? String(row.agent_id) : null,
    createdAt: new Date(row.created_at as string),
  };
}

export async function getAuditLogForEntity(
  entityType: string,
  entityId: string,
  limit = 50
): Promise<AuditLogEntry[]> {
  const rows = await queryRowsAdmin(
    `select id, entity_type, entity_id, trigger, action,
            before_state, after_state, cascade_result,
            performed_by, agent_id, created_at
     from audit_log
     where entity_type = $1 and entity_id = $2
     order by created_at desc
     limit $3`,
    [entityType, entityId, limit]
  );
  return rows.map(rowToEntry);
}

export async function getRecentAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  const rows = await queryRowsAdmin(
    `select id, entity_type, entity_id, trigger, action,
            before_state, after_state, cascade_result,
            performed_by, agent_id, created_at
     from audit_log
     order by created_at desc
     limit $1`,
    [limit]
  );
  return rows.map(rowToEntry);
}

export async function getAuditLogByTrigger(
  trigger: string,
  limit = 100
): Promise<AuditLogEntry[]> {
  const rows = await queryRowsAdmin(
    `select id, entity_type, entity_id, trigger, action,
            before_state, after_state, cascade_result,
            performed_by, agent_id, created_at
     from audit_log
     where trigger = $1
     order by created_at desc
     limit $2`,
    [trigger, limit]
  );
  return rows.map(rowToEntry);
}
