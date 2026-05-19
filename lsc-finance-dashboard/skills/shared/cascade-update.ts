/**
 * Cascade Update Skill
 *
 * Executes cascade rules + writes audit_log for every mutation.
 * Every server action that writes to DB should call this AFTER the write
 * succeeds, so failures don't leave orphaned audit entries.
 *
 * Design:
 *  1. Run cascade (currently mostly no-ops since SQL views are live)
 *  2. Write a single audit_log row capturing before/after + cascade result
 *  3. Never throw — audit failures are logged but don't break callers
 */

import { executeCascade, type CascadeEvent, type CascadeResult } from "../../ontology/cascades";
import { writeAuditLog } from "./audit-log";
import { executeAdmin } from "@lsc/db";

export type CascadeInput = CascadeEvent & {
  /** Short imperative action name, e.g. 'approve', 'post', 'create', 'update', 'delete' */
  action: string;
  /** Which agent/workflow triggered this mutation */
  agentId?: string;
};

export async function cascadeUpdate(event: CascadeInput): Promise<CascadeResult> {
  let result: CascadeResult;
  try {
    result = await executeCascade(event);
  } catch (err) {
    // executeCascade currently can't throw, but if future rule handlers do,
    // capture the failure without discarding the audit write.
    result = {
      trigger: event.trigger,
      actionsExecuted: [],
      errors: [
        {
          action: "write-audit-log",
          error: `cascade execution failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ],
    };
  }

  for (const action of result.actionsExecuted) {
    const executionStatus = action.startsWith("refresh-") ? "skipped_live_view" : action.startsWith("trigger-") ? "queued" : "executed";
    try {
      await executeAdmin(
        `insert into cascade_action_events (
           trigger, entity_type, entity_id, action_type, execution_status,
           performed_by, agent_id, metadata
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          event.trigger,
          event.entityType,
          event.entityId,
          action,
          executionStatus,
          event.performedBy ?? null,
          event.agentId ?? null,
          JSON.stringify({
            liveView: executionStatus === "skipped_live_view",
            queuedAnalyzer: executionStatus === "queued",
          }),
        ]
      );
    } catch (err) {
      result.errors.push({
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await writeAuditLog({
    entityType: event.entityType,
    entityId: event.entityId,
    trigger: event.trigger,
    action: event.action,
    before: event.before ?? null,
    after: event.after ?? null,
    cascadeResult: {
      actions: result.actionsExecuted,
      errors: result.errors,
    },
    performedBy: event.performedBy ?? null,
    agentId: event.agentId ?? null,
  });

  return result;
}
