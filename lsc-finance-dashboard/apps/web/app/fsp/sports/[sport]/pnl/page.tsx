import { getPnlStatementDashboard } from "@lsc/db";
import { requireRole } from "../../../../../lib/auth";
import { PnlStatementWorkspace } from "../../../../components/pnl-statement-workspace";

type PageProps = {
  params: Promise<{
    sport: string;
  }>;
  searchParams?: Promise<{
    scenario?: string;
    period?: string;
  }>;
};

export default async function FspSportPnlPage({ params, searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const routeParams = await params;
  const query = searchParams ? await searchParams : {};
  const sport = routeParams.sport.toLowerCase();
  const data = await getPnlStatementDashboard({
    ownerType: "sport",
    ownerCode: sport,
    scenarioCode: query.scenario,
    selectedPeriodCode: query.period
  });

  return <PnlStatementWorkspace basePath={`/fsp/sports/${sport}/pnl`} data={data} />;
}
