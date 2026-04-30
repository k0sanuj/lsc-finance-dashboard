import { getPayrollByMonth, getPayrollDetail } from "@lsc/db";
import { requireRole } from "../../lib/auth";
import type { Route } from "next";
import Link from "next/link";
import { getCompanyOptions, getEntityMetadata, normalizeCompanyCode, type VisibleEntityCode } from "../lib/entities";

const COMPANIES = ["XTZ", "LSC"] as const satisfies readonly VisibleEntityCode[];
const COMPANY_OPTIONS = getCompanyOptions(COMPANIES);

function fmt(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function statusPill(status: string): string {
  switch (status) {
    case "approved":
    case "paid":
      return "signal-pill signal-good";
    case "cancelled":
      return "signal-pill signal-risk";
    case "draft":
      return "subtle-pill";
    default:
      return "subtle-pill";
  }
}

export default async function SalaryPayablePage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; company?: string; status?: string; message?: string }>;
}) {
  await requireRole(["super_admin", "finance_admin", "viewer"]);

  const params = await searchParams;
  const company = normalizeCompanyCode(params.company, "XTZ");
  const entity = getEntityMetadata(company);
  const selectedMonth = params.month;

  const [months, detail] = await Promise.all([
    getPayrollByMonth(company),
    selectedMonth ? getPayrollDetail(company, selectedMonth) : Promise.resolve([])
  ]);

  const totalMonths = months.length;
  const currentMonth = months[0];
  const ytdTotal = months.reduce((sum, m) => sum + m.totalNet, 0);

  const monthLabel = selectedMonth
    ? new Date(selectedMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Payroll</span>
          <h3>Salary Payable</h3>
        </div>
        <div className="workspace-header-right">
          <span className="pill">{entity.shortLabel}</span>
        </div>
      </section>

      {/* Company filter */}
      <nav style={{ display: "flex", gap: "0.5rem" }}>
        {COMPANY_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={`/salary-payable?company=${option.value}` as Route}
            className={`segment-chip${option.value === company ? " active" : ""}`}
          >
            {option.shortLabel}
          </Link>
        ))}
      </nav>

      {params.message && (
        <div className="notice">{params.message}</div>
      )}

      {/* Stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Months tracked</span>
            <span className="badge">History</span>
          </div>
          <div className="metric-value">{totalMonths}</div>
          <span className="metric-subvalue">Total payroll periods</span>
        </article>

        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Current headcount</span>
            <span className="badge">Latest</span>
          </div>
          <div className="metric-value">{currentMonth?.headcount ?? 0}</div>
          <span className="metric-subvalue">
            {currentMonth ? currentMonth.month : "No data yet"}
          </span>
        </article>

        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Current net payroll</span>
            <span className="badge">Latest</span>
          </div>
          <div className="metric-value">
            {currentMonth ? fmt(currentMonth.totalNet) : "$0"}
          </div>
          <span className="metric-subvalue">
            {currentMonth ? currentMonth.month : "No payroll data"}
          </span>
        </article>

        <article className="metric-card">
          <div className="metric-topline">
            <span className="metric-label">YTD total</span>
            <span className="badge">Cumulative</span>
          </div>
          <div className="metric-value">{fmt(ytdTotal)}</div>
          <span className="metric-subvalue">All months combined</span>
        </article>
      </section>

      {/* Month-by-month summary table */}
      <section className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Monthly breakdown</span>
            <h3>Payroll by Month</h3>
          </div>
          <span className="pill">{totalMonths} months</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Headcount</th>
                <th>Base Total</th>
                <th>Allowances</th>
                <th>Deductions</th>
                <th>Tax</th>
                <th>Net Salary</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              {months.length > 0 ? (
                months.map((m) => (
                  <tr key={m.monthRaw}>
                    <td>
                      <Link
                        href={`/salary-payable?company=${company}&month=${m.monthRaw}` as Route}
                        className="ghost-link"
                      >
                        <strong>{m.month}</strong>
                      </Link>
                    </td>
                    <td>{m.headcount}</td>
                    <td>{fmt(m.totalBase)}</td>
                    <td>{fmt(m.totalAllowances)}</td>
                    <td>{fmt(m.totalDeductions)}</td>
                    <td>{fmt(m.totalTax)}</td>
                    <td><strong>{fmt(m.totalNet)}</strong></td>
                    <td>{m.currency}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={8}>
                    No payroll records yet. Salary amounts will be added once confirmed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detail table for selected month */}
      {selectedMonth && detail.length > 0 && (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Employee detail</span>
              <h3>{monthLabel} Payroll</h3>
            </div>
            <span className="pill">{detail.length} employees</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Employee Name</th>
                  <th>Designation</th>
                  <th>Base Salary</th>
                  <th>Allowances</th>
                  <th>Deductions</th>
                  <th>Tax</th>
                  <th>Net Salary</th>
                  <th>Status</th>
                  <th>Paid At</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.employeeName}</strong></td>
                    <td>{row.designation}</td>
                    <td>{row.baseSalary}</td>
                    <td>{row.allowances}</td>
                    <td>{row.deductions}</td>
                    <td>{row.taxWithheld}</td>
                    <td><strong>{row.netSalary}</strong></td>
                    <td>
                      <span className={`pill ${statusPill(row.status)}`}>
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>{row.paidAt || <span className="muted">--</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedMonth && detail.length === 0 && (
        <section className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Employee detail</span>
              <h3>{monthLabel} Payroll</h3>
            </div>
          </div>
          <p className="muted" style={{ padding: "1.5rem" }}>
            No payroll records yet. Salary amounts will be added once confirmed.
          </p>
        </section>
      )}
    </div>
  );
}
