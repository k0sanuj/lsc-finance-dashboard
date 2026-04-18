/**
 * POST /api/orchestrate
 *
 * Body: { message: string, context?: object, autoRunHitl?: boolean }
 * Returns: OrchestratorResult
 *
 * Admin-only. This is the end-to-end loop:
 *   user message → Gemini intent classify → RoutingPlan → dispatcher → results
 */
import { NextResponse } from "next/server";
import { requireRole } from "../../../lib/auth";
import { orchestrate } from "@lsc/agents/orchestrator";
import { dispatch } from "@lsc/skills/dispatcher";

export async function POST(req: Request) {
  try {
    await requireRole(["super_admin", "finance_admin"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string; context?: Record<string, unknown>; autoRunHitl?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.message || typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const result = await orchestrate(
    {
      message: body.message.trim(),
      context: body.context,
      autoRunHitl: body.autoRunHitl === true,
    },
    dispatch
  );

  return NextResponse.json(result);
}
