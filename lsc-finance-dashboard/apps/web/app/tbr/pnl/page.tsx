import { getPnlStatementDashboard } from "@lsc/db";
import { requireRole } from "../../../lib/auth";
import { PnlStatementWorkspace } from "../../components/pnl-statement-workspace";

type PageProps = {
  searchParams?: Promise<{
    scenario?: string;
    period?: string;
  }>;
};

export default async function TbrPnlPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const params = searchParams ? await searchParams : {};
  const data = await getPnlStatementDashboard({
    ownerType: "entity",
    ownerCode: "TBR",
    scenarioCode: params.scenario,
    selectedPeriodCode: params.period
  });

  return <PnlStatementWorkspace basePath="/tbr/pnl" data={data} />;
}
