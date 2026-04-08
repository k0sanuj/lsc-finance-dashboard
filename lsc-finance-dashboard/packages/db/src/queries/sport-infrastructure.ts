import "server-only";

import { queryRows } from "../query";
import { formatCurrency, getBackend } from "./shared";

// ─── Types ─────────────────────────────────────────────────

export type InfrastructureRow = {
  id: string;
  sportName: string;
  component: string;
  criticalRequirement: string;
  whatToCheck: string;
  verificationProof: string;
  estimatedCost: string;
  vendorName: string;
  status: string;
};

export type BroadcastSpecRow = {
  id: string;
  sportName: string;
  category: string;
  specName: string;
  technicalRequirement: string;
  whatToCheck: string;
  estimatedCost: string;
  status: string;
};

// ─── Queries ───────────────────────────────────────────────

export async function getSportInfrastructure(sportId?: string): Promise<InfrastructureRow[]> {
  if (getBackend() !== "database") return [];

  const whereClause = sportId
    ? `where si.sport_id = $1`
    : "";
  const params = sportId ? [sportId] : [];

  const rows = await queryRows<{
    id: string;
    sport_name: string;
    component: string;
    critical_requirement: string | null;
    what_to_check: string | null;
    verification_proof: string | null;
    estimated_cost: string;
    vendor_name: string | null;
    status: string;
  }>(
    `select
       si.id,
       fs.sport_name,
       si.component,
       si.critical_requirement,
       si.what_to_check,
       si.verification_proof,
       coalesce(si.estimated_cost, 0)::numeric(14,2)::text as estimated_cost,
       si.vendor_name,
       si.status
     from sport_infrastructure si
     join fsp_sports fs on fs.id = si.sport_id
     ${whereClause}
     order by si.component`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    sportName: r.sport_name,
    component: r.component,
    criticalRequirement: r.critical_requirement ?? "",
    whatToCheck: r.what_to_check ?? "",
    verificationProof: r.verification_proof ?? "",
    estimatedCost: formatCurrency(r.estimated_cost),
    vendorName: r.vendor_name ?? "",
    status: r.status
  }));
}

export async function getBroadcastSpecs(sportId?: string): Promise<BroadcastSpecRow[]> {
  if (getBackend() !== "database") return [];

  const whereClause = sportId
    ? `where bs.sport_id = $1`
    : "";
  const params = sportId ? [sportId] : [];

  const rows = await queryRows<{
    id: string;
    sport_name: string;
    category: string;
    spec_name: string;
    technical_requirement: string | null;
    what_to_check: string | null;
    estimated_cost: string;
    status: string;
  }>(
    `select
       bs.id,
       fs.sport_name,
       bs.category,
       bs.spec_name,
       bs.technical_requirement,
       bs.what_to_check,
       coalesce(bs.estimated_cost, 0)::numeric(14,2)::text as estimated_cost,
       bs.status
     from broadcast_specs bs
     join fsp_sports fs on fs.id = bs.sport_id
     ${whereClause}
     order by bs.category, bs.spec_name`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    sportName: r.sport_name,
    category: r.category,
    specName: r.spec_name,
    technicalRequirement: r.technical_requirement ?? "",
    whatToCheck: r.what_to_check ?? "",
    estimatedCost: formatCurrency(r.estimated_cost),
    status: r.status
  }));
}
