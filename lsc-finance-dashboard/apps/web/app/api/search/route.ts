/**
 * GET /api/search?q=foo
 *
 * Fuzzy entity search across vendors, employees, races, invoices, deals,
 * subscriptions, sponsors. Used by the Cmd+K command palette.
 *
 * Admin-only. Returns [] for queries shorter than 2 chars.
 */
import { NextResponse } from "next/server";
import { searchEntities } from "@lsc/db";
import { requireRole } from "../../../lib/auth";

export async function GET(req: Request) {
  try {
    await requireRole(["super_admin", "finance_admin", "viewer"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ hits: [] });
  }

  try {
    const hits = await searchEntities(q, { perTypeLimit: 5 });
    return NextResponse.json({ hits });
  } catch (err) {
    console.error("[api/search] failed:", err);
    return NextResponse.json(
      { hits: [], error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
