"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";
import { requireRole, requireSession } from "../../../../../lib/auth";

function clean(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function redir(sport: string, tab: string, status: string, msg: string): never {
  redirect(
    `/fsp/sports/${sport}/infrastructure?tab=${tab}&status=${status}&message=${encodeURIComponent(msg)}` as Route
  );
}

async function getSportId(sportCode: string): Promise<string> {
  const rows = await queryRowsAdmin<{ id: string }>(
    `select fs.id from fsp_sports fs join companies c on c.id = fs.company_id
     where c.code = 'FSP'::company_code and fs.sport_code = $1::fsp_sport_code`,
    [sportCode]
  );
  return rows[0]?.id ?? "";
}

// ─── Infrastructure ────────────────────────────────────────

export async function addInfrastructureAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const component = clean(formData.get("component"));
  const criticalRequirement = clean(formData.get("criticalRequirement"));
  const whatToCheck = clean(formData.get("whatToCheck"));
  const verificationProof = clean(formData.get("verificationProof"));
  const estimatedCost = clean(formData.get("estimatedCost")) || "0";
  const vendorName = clean(formData.get("vendorName"));
  const status = clean(formData.get("status")) || "pending";

  if (!component) redir(sport, "infrastructure", "error", "Component name is required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "infrastructure", "error", "Sport not found.");

  await executeAdmin(
    `insert into sport_infrastructure
       (sport_id, component, critical_requirement, what_to_check, verification_proof, estimated_cost, vendor_name, status)
     values ($1, $2, $3, $4, $5, $6::numeric, $7, $8)`,
    [sportId, component, criticalRequirement || null, whatToCheck || null, verificationProof || null, estimatedCost, vendorName || null, status]
  );

  await cascadeUpdate({
    trigger: "sport-infrastructure:created",
    entityType: "sport_infrastructure",
    entityId: sportId,
    action: "create",
    after: { sport, component, estimatedCost, vendorName, status },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}/infrastructure`);
  redir(sport, "infrastructure", "success", `Added infrastructure item "${component}".`);
}

// ─── Broadcast Specs ───────────────────────────────────────

export async function addBroadcastSpecAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const sport = clean(formData.get("sport"));
  const category = clean(formData.get("category"));
  const specName = clean(formData.get("specName"));
  const technicalRequirement = clean(formData.get("technicalRequirement"));
  const whatToCheck = clean(formData.get("whatToCheck"));
  const estimatedCost = clean(formData.get("estimatedCost")) || "0";
  const status = clean(formData.get("status")) || "pending";

  if (!specName) redir(sport, "broadcast", "error", "Spec name is required.");

  const sportId = await getSportId(sport);
  if (!sportId) redir(sport, "broadcast", "error", "Sport not found.");

  await executeAdmin(
    `insert into broadcast_specs
       (sport_id, category, spec_name, technical_requirement, what_to_check, estimated_cost, status)
     values ($1, $2, $3, $4, $5, $6::numeric, $7)`,
    [sportId, category || "General", specName, technicalRequirement || null, whatToCheck || null, estimatedCost, status]
  );

  await cascadeUpdate({
    trigger: "sport-broadcast-spec:created",
    entityType: "broadcast_spec",
    entityId: sportId,
    action: "create",
    after: { sport, category, specName, estimatedCost, status },
    performedBy: session.id,
    agentId: "sports-module-agent",
  });

  revalidatePath(`/fsp/sports/${sport}/infrastructure`);
  redir(sport, "broadcast", "success", `Added broadcast spec "${specName}".`);
}
