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
