import { strict as assert } from "node:assert";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { AgentId } from "../agents/agent-graph";
import { orchestrate } from "../agents/orchestrator";
import { dispatch } from "../skills/dispatcher";
import { cascadeUpdate } from "../skills/shared/cascade-update";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

async function cleanupUpload(idempotencyKey: string, sourceDocumentId?: string) {
  if (sourceDocumentId) {
    await executeAdmin("delete from cascade_action_events where entity_id = $1", [sourceDocumentId]);
    await executeAdmin("delete from audit_log where entity_id = $1", [sourceDocumentId]);
    await executeAdmin("delete from source_documents where id = $1", [sourceDocumentId]);
  }
  await executeAdmin(
    `delete from agent_mutation_idempotency
     where agent_id = $1 and skill = $2 and idempotency_key = $3`,
    [AgentId.DocumentAgent, "upload-document", idempotencyKey]
  );
}

async function main() {
loadEnv();
delete process.env.ANTHROPIC_API_KEY;

const readResult = await dispatch(AgentId.FinanceAgent, "company-metrics", {});
assert.equal(readResult.ok, true, "representative read-only skill should execute");

const deniedNoApproval = await dispatch(AgentId.DocumentAgent, "upload-document", {
  sourceName: "agent-runtime-safety.pdf",
  companyCode: "LSC",
});
assert.equal(deniedNoApproval.ok, false);
assert.equal(deniedNoApproval.code, "APPROVAL_REQUIRED");

const deniedNoIdempotency = await dispatch(AgentId.DocumentAgent, "upload-document", {
  approved: true,
  sourceName: "agent-runtime-safety.pdf",
  companyCode: "LSC",
});
assert.equal(deniedNoIdempotency.ok, false);
assert.equal(deniedNoIdempotency.code, "IDEMPOTENCY_REQUIRED");

const idempotencyKey = `agent-runtime-${Date.now()}`;
let uploadedId: string | undefined;
try {
  const mutation = await dispatch(AgentId.DocumentAgent, "upload-document", {
    approved: true,
    idempotencyKey,
    sourceName: "agent-runtime-safety.pdf",
    sourceIdentifier: idempotencyKey,
    companyCode: "LSC",
    performedBy: "agent-runtime-test",
  });
  assert.equal(mutation.ok, true, "approved mutation should succeed");
  uploadedId = (mutation.ok ? (mutation.data as { id?: string }).id : undefined) ?? undefined;
  assert.ok(uploadedId, "approved mutation should return inserted source document id");

  const replay = await dispatch(AgentId.DocumentAgent, "upload-document", {
    approved: true,
    idempotencyKey,
    sourceName: "agent-runtime-safety-replay.pdf",
    sourceIdentifier: idempotencyKey,
    companyCode: "LSC",
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "IDEMPOTENCY_REPLAY");

  const [idempotencyRows, cascadeRows, auditRows] = await Promise.all([
    queryRowsAdmin<{ count: number }>(
      `select count(*)::int as count
       from agent_mutation_idempotency
       where idempotency_key = $1 and status = 'succeeded'`,
      [idempotencyKey]
    ),
    queryRowsAdmin<{ count: number }>(
      `select count(*)::int as count
       from cascade_action_events
       where entity_id = $1`,
      [uploadedId]
    ),
    queryRowsAdmin<{ count: number }>(
      `select count(*)::int as count
       from audit_log
       where entity_id = $1`,
      [uploadedId]
    ),
  ]);
  assert.equal(idempotencyRows[0]?.count, 1, "idempotency row should be recorded");
  assert.ok((cascadeRows[0]?.count ?? 0) > 0, "cascade action events should be recorded");
  assert.ok((auditRows[0]?.count ?? 0) > 0, "audit log should be recorded");
} finally {
  await cleanupUpload(idempotencyKey, uploadedId);
}

const cascadeEntityId = randomUUID();
try {
  await cascadeUpdate({
    trigger: "expense:approved",
    entityType: "agent_runtime_test",
    entityId: cascadeEntityId,
    action: "cascade-runtime-smoke",
    after: { ok: true },
    performedBy: "agent-runtime-test",
    agentId: AgentId.ExpenseAgent,
  });
  const queued = await queryRowsAdmin<{ count: number }>(
    `select count(*)::int as count
     from cascade_action_events
     where entity_id = $1
       and action_type like 'trigger-%'
       and execution_status = 'queued'`,
    [cascadeEntityId]
  );
  assert.ok((queued[0]?.count ?? 0) > 0, "trigger-* cascade actions should be queued");
} finally {
  await executeAdmin("delete from cascade_action_events where entity_id = $1", [cascadeEntityId]);
  await executeAdmin("delete from audit_log where entity_id = $1", [cascadeEntityId]);
}

const message = `Agent runtime fallback ${Date.now()}`;
const messageHash = createHash("sha256").update(message).digest("hex");
const orchestrated = await orchestrate(
  { message },
  async () => ({ ok: true as const, data: { smoke: true } })
);
assert.equal(orchestrated.intent, "overview-fallback");
assert.ok(orchestrated.fallbackReason, "orchestrator fallback should be explicit");

const runtimeRows = await queryRowsAdmin<{
  id: string;
  action: string;
  details: { runId?: string };
}>(
  `select id, action, details
   from agent_activity_log
   where details->>'messageHash' = $1
   order by created_at desc`,
  [messageHash]
);
assert.ok(runtimeRows.length > 0, "orchestrator should write runtime activity");
const runId = runtimeRows[0]?.details?.runId;
assert.ok(runId, "orchestrator runtime activity should include runId");
const stepRows = await queryRowsAdmin<{ count: number }>(
  `select count(*)::int as count
   from agent_activity_log
   where details->>'runId' = $1 and action = 'dispatch_step_success'`,
  [runId]
);
assert.ok((stepRows[0]?.count ?? 0) > 0, "dispatch steps should write runtime activity");
await executeAdmin("delete from agent_activity_log where details->>'runId' = $1", [runId]);

console.log(
  JSON.stringify(
    {
      ok: true,
      readSkill: "finance-agent:company-metrics",
      mutationGuards: ["APPROVAL_REQUIRED", "IDEMPOTENCY_REQUIRED", "IDEMPOTENCY_REPLAY"],
      cascadeQueued: true,
      runtimeActivity: true,
    },
    null,
    2
  )
);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
