/**
 * Cascade Update Skill
 *
 * Executes cascade rules after mutations.
 * Connects the ontology cascade engine to the audit log.
 */

import { executeCascade, type CascadeEvent, type CascadeResult } from "../../ontology/cascades";
import { writeAuditLog } from "./audit-log";

/**
 * Run cascade after a mutation.
 * Logs the mutation to audit trail and executes all triggered actions.
 */
export async function cascadeUpdate(event: CascadeEvent): Promise<CascadeResult> {
  // Write audit log entry
  await writeAuditLog({
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.trigger,
    before: (event.before as Record<string, unknown>) ?? null,
    after: (event.after as Record<string, unknown>) ?? null,
    cascadeTriggered: true,
    cascadeDetails: null, // Will be populated after cascade executes
    performedBy: event.performedBy ?? null,
  });

  // Execute cascade rules
  const result = await executeCascade(event);

  // Log cascade result to audit if there were actions
  if (result.actionsExecuted.length > 0) {
    await writeAuditLog({
      entityType: "cascade",
      entityId: event.entityId,
      action: `cascade:${event.trigger}`,
      before: null,
      after: null,
      cascadeTriggered: false,
      cascadeDetails: {
        trigger: event.trigger,
        actions: result.actionsExecuted,
      },
      performedBy: "system",
    });
  }

  return result;
}
