import Link from "next/link";
import {
  CircleDollarSign,
  CreditCard,
  FileStack,
  ReceiptText,
  TrendingUp,
  Users,
  WalletCards
} from "lucide-react";
import { getEntityDashboard } from "@lsc/db";
import {
  CashMovementChart,
  HorizontalComparisonChart,
  StatusDonutChart,
  type ChartDatum
} from "../components/lsc-dashboard-charts";
import { MetricTile, Panel } from "../components/lsc-blue-primitives";
import { requireRole } from "../../lib/auth";

const metricIcons = [ReceiptText, TrendingUp, FileStack, Users, CreditCard, WalletCards] as const;

export default async function XtzPage() {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const dashboard = await getEntityDashboard("XTZ");
  const trendRows: ChartDatum[] = dashboard.trend.map((row) => ({
    ...row,
    cashIn: row.paid ?? 0,
    cashOut: 0,
    net: row.committed ?? 0
  }));

  return (
    <div className="page-grid lsc-dashboard-page">
      <section className="workspace-header command-header">
        <div className="workspace-header-left">
          <span className="section-kicker">XTZ India</span>
          <h3>{dashboard.title}</h3>
          <p className="muted">{dashboard.subtitle}</p>
        </div>
        <div className="workspace-header-right">
          <div className="segment-row">
            {dashboard.links.slice(0, 4).map((link) => (
              <Link className="segment-chip" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="analytics-kpi-grid">
        {dashboard.metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? CircleDollarSign;
          return (
            <MetricTile
              helper={metric.helper}
              icon={Icon}
              key={metric.label}
              label={metric.label}
              tone={metric.tone}
              value={metric.value}
            />
          );
        })}
      </section>

      <section className="lsc-dashboard-hero-grid">
        <Panel
          className="dashboard-chart-panel dashboard-primary-chart"
          title="Invoice accrual ladder"
          subtitle="Generated/sent invoices are committed; paid invoices become recognized cost/revenue and cash movement."
          trailing={<span className="badge">Approval controlled</span>}
        >
          <CashMovementChart data={trendRows} height={305} />
          <div className="lsc-chart-summary-strip">
            {dashboard.metrics.slice(0, 3).map((metric) => (
              <span key={metric.label}>
                <strong>{metric.value}</strong>
                {metric.label}
              </span>
            ))}
          </div>
        </Panel>

        <div className="lsc-dashboard-side-stack">
          {dashboard.insights.map((insight) => (
            <MetricTile
              helper={insight.summary}
              icon={insight.tone === "good" ? TrendingUp : insight.tone === "amber" ? CreditCard : WalletCards}
              key={insight.title}
              label={insight.title}
              tone={insight.tone}
              value=""
            />
          ))}
        </div>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Invoice status mix"
          subtitle="Active and voided invoice state by USD reporting amount."
        >
          <StatusDonutChart data={dashboard.statusMix} height={255} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Billed-entity exposure"
          subtitle="Committed and paid XTZ invoices by receiving entity."
        >
          <HorizontalComparisonChart data={dashboard.primaryMix} height={280} />
        </Panel>
      </section>

      <section className="lsc-dashboard-two-one-grid">
        <Panel
          className="dashboard-chart-panel"
          title="Payroll and payout operations"
          subtitle="Worker payout facts stay separate from invoice recognition."
        >
          <StatusDonutChart data={dashboard.secondaryMix} height={255} />
        </Panel>

        <Panel
          className="dashboard-chart-panel"
          title="Recognition policy"
          subtitle="How XTZ invoices affect LSC/TBR/FSP cost workspaces."
          trailing={<span className="pill">Accrual ladder</span>}
        >
          <div className="xtz-dashboard-summary">
            <div>
              <span className="section-kicker">Generated / sent</span>
              <strong>Commitment</strong>
              <span>Shown as payable pressure, not approved cost.</span>
            </div>
            <div>
              <span className="section-kicker">Paid</span>
              <strong>Cost + cash</strong>
              <span>Recognized for billed entity and XTZ revenue.</span>
            </div>
            <div>
              <span className="section-kicker">Void</span>
              <strong>Audit only</strong>
              <span>Kept for lineage, excluded from totals.</span>
            </div>
          </div>
        </Panel>
      </section>

      <section className="card-grid">
        {dashboard.links.map((link) => (
          <Link className="card" href={link.href} key={link.href}>
            <div className="card-title-row">
              <div>
                <span className="section-kicker">XTZ module</span>
                <h3>{link.label}</h3>
              </div>
              <span className="ghost-link">Open</span>
            </div>
            <p className="muted">{link.helper}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
