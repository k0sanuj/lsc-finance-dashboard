import { executeAdmin, queryRowsAdmin } from "@lsc/db";

export type AgentRuntimeStatus = "running" | "success" | "error" | "skipped" | "fallback";

export type AgentActivityInput = {
  agentId: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  performedBy?: string | null;
};

export type AgentActivityRow = {
  id: string;
  agent_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  performed_by: string | null;
  created_at: string;
};

function isUuid(value: string | null | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

export async function logAgentActivity(input: AgentActivityInput) {
  try {
    await executeAdmin(
      `insert into agent_activity_log (
         agent_id, action, entity_type, entity_id, details, performed_by
       )
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        input.agentId,
        input.action,
        input.entityType ?? null,
        isUuid(input.entityId) ? input.entityId : null,
        JSON.stringify(input.details ?? {}),
        isUuid(input.performedBy) ? input.performedBy : null,
      ]
    );
  } catch (err) {
    console.error(
      "[agent-observability] failed to write activity",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function getRecentAgentActivity(limit = 20) {
  try {
    return await queryRowsAdmin<AgentActivityRow>(
      `select id,
              agent_id,
              action,
              entity_type,
              entity_id::text,
              details,
              performed_by::text,
              created_at::text
       from agent_activity_log
       order by created_at desc
       limit $1`,
      [limit]
    );
  } catch {
    return [];
  }
}

