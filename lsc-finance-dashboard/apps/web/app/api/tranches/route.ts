import { NextResponse } from "next/server";
import { executeAdmin, queryRowsAdmin } from "@lsc/db";

type TrancheDraft = {
  trancheLabel: string;
  tranchePercentage: number;
  triggerType: string;
  triggerRaceEventId?: string | null;
  triggerDate?: string | null;
  triggerOffsetDays?: number;
  deliverableChecklistId?: string | null;
  notes?: string | null;
};

type CreateTranchesPayload = {
  contractId: string;
  tranches: TrancheDraft[];
};

function isValidTriggerType(t: string): boolean {
  return ["on_signing", "pre_event", "post_event", "on_milestone", "on_date"].includes(t);
}

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || apiKey !== process.env.LSC_INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CreateTranchesPayload;

    if (!body.contractId || !Array.isArray(body.tranches) || body.tranches.length === 0) {
      return NextResponse.json(
        { error: "contractId and at least one tranche required." },
        { status: 400 }
      );
    }

    const contractRows = await queryRowsAdmin<{
      id: string;
      company_id: string;
      sponsor_or_customer_id: string;
      contract_value: string;
    }>(
      `select id, company_id, sponsor_or_customer_id, contract_value
       from contracts where id = $1 limit 1`,
      [body.contractId]
    );
    const contract = contractRows[0];
    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    const contractValue = Number(contract.contract_value);
    const created: string[] = [];

    for (let i = 0; i < body.tranches.length; i++) {
      const t = body.tranches[i];
      const label = (t.trancheLabel ?? "").trim();
      if (!label) continue;

      if (!isValidTriggerType(t.triggerType)) {
        return NextResponse.json(
          { error: `Invalid trigger type "${t.triggerType}" on tranche ${i + 1}.` },
          { status: 400 }
        );
      }

      const pct = Number(t.tranchePercentage) || 0;
      const amount = Number((contractValue * pct / 100).toFixed(2));

      const rows = await queryRowsAdmin<{ id: string }>(
        `insert into contract_tranches (
           contract_id, company_id, sponsor_or_customer_id,
           tranche_number, tranche_label, tranche_percentage, tranche_amount,
           trigger_type, trigger_race_event_id, trigger_date, trigger_offset_days,
           deliverable_checklist_id, notes
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8::tranche_trigger_type, $9, $10, $11, $12, $13)
         returning id`,
        [
          body.contractId,
          contract.company_id,
          contract.sponsor_or_customer_id,
          i + 1,
          label,
          pct,
          amount,
          t.triggerType,
          t.triggerRaceEventId || null,
          t.triggerDate || null,
          Number(t.triggerOffsetDays) || 0,
          t.deliverableChecklistId || null,
          (t.notes ?? "").trim() || null
        ]
      );

      if (rows[0]?.id) {
        created.push(rows[0].id);
      }
    }

    return NextResponse.json({
      success: true,
      contractId: body.contractId,
      tranchesCreated: created.length,
      trancheIds: created
    });
  } catch (error) {
    console.error("[API /api/tranches]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
