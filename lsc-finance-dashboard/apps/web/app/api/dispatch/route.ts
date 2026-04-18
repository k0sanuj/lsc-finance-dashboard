/**
 * POST /api/dispatch — invoke a single skill via the agent graph dispatcher.
 *
 * Body: { agentId: string, skill: string, payload?: Record<string, unknown> }
 * Returns: SkillResult (ok/error envelope)
 *
 * Admin-only. Primarily used by the orchestrator (future) and for dev testing.
 */
import { NextResponse } from "next/server";
import { requireRole } from "../../../lib/auth";
import { dispatch } from "@lsc/skills/dispatcher";
import type { AgentId } from "@lsc/agents/agent-graph";

export async function POST(req: Request) {
  try {
    await requireRole(["super_admin", "finance_admin"]);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  let body: { agentId?: string; skill?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const agentId = body.agentId as AgentId | undefined;
  const skill = body.skill;

  if (!agentId || !skill) {
    return NextResponse.json(
      { ok: false, error: "agentId and skill are required", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  const result = await dispatch(agentId, skill, body.payload ?? {});

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
  });
}
