import { requireRole } from "../../lib/auth";
import { getEmployees, getFxRatesForDisplay } from "@lsc/db";
import { EmptyState } from "../components/empty-state";
import { RowHighlight } from "../components/row-highlight";
import { SubmitButton } from "../components/submit-button";
import {
  addEmployeeAction,
  updateEmployeeStatusAction,
  updateSalaryAction,
  updateEmployeeAction
} from "./actions";

const COMPANIES = ["XTZ", "XTE", "TBR", "FSP"] as const;

const COMPANY_CURRENCY: Record<string, string> = {
  XTZ: "INR",
  XTE: "USD",
  TBR: "AED",
  FSP: "USD",
  LSC: "USD"
};

type EmployeesPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    company?: string;
  }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const params = searchParams ? await searchParams : undefined;
  const status = params?.status ?? null;
  const message = params?.message ?? null;
  const company = params?.company ?? "XTZ";
  const defaultCurrency = COMPANY_CURRENCY[company] ?? "USD";

  const [employees, fxRates] = await Promise.all([
    getEmployees(company),
    getFxRatesForDisplay()
  ]);

  const totalCount = employees.length;
  const activeCount = employees.filter((e) => e.status === "active").length;
  const onLeaveCount = employees.filter((e) => e.status === "on leave").length;
  const terminatedCount = employees.filter((e) => e.status === "terminated").length;
  const totalPayroll = employees
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + e.rawBaseSalary, 0);

  function statusPillClass(s: string): string {
    if (s === "active") return "signal-pill signal-good";
    if (s === "on leave" || s === "notice period") return "signal-pill signal-warn";
    if (s === "terminated") return "signal-pill signal-risk";
    return "pill";
  }

  return (
    <div className="page-grid">
      <RowHighlight />
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">People &amp; payroll</span>
          <h3>Employee Management</h3>
        </div>
      </section>

      {/* Company filter */}
      <nav className="inline-actions">
        {COMPANIES.map((code) => (
          <a
            key={code}
            href={`/employees?company=${code}`}
            className={`segment-chip${code === company ? " active" : ""}`}
          >
            {code}
          </a>
        ))}
      </nav>

      {/* Stats */}
      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Total</span></div>
          <div className="metric-value">{totalCount}</div>
          <span className="metric-subvalue">{company}</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline"><span className="metric-label">Active</span></div>
          <div className="metric-value">{activeCount}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline"><span className="metric-label">On leave</span></div>
          <div className="metric-value">{onLeaveCount}</div>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline"><span className="metric-label">Terminated</span></div>
          <div className="metric-value">{terminatedCount}</div>
        </article>
        <article className="metric-card">
          <div className="metric-topline"><span className="metric-label">Monthly payroll</span></div>
          <div className="metric-value">
            {totalPayroll.toLocaleString("en-US", { style: "currency", currency: defaultCurrency, maximumFractionDigits: 0 })}
          </div>
          <span className="metric-subvalue">{defaultCurrency} · active only</span>
        </article>
      </section>

      {/* Live FX rates */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Live exchange rates</span>
            <h3>Currency conversion</h3>
          </div>
          <span className="badge">Auto-refreshed</span>
        </div>
        <div className="inline-actions">
          {fxRates.map((fx) => (
            <span className="pill subtle-pill" key={`${fx.baseCurrency}${fx.targetCurrency}`}>
              1 {fx.baseCurrency} = {fx.rate.toFixed(fx.rate > 10 ? 2 : 4)} {fx.targetCurrency}
            </span>
          ))}
        </div>
      </article>

      {/* Status/message notice */}
      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : "Done"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {/* Add employee form (collapsed by default) */}
      <article className="card collapsible-card">
        <details>
          <summary className="card-title-row collapsible-summary">
            <div>
              <span className="section-kicker">New hire</span>
              <h3>Add employee</h3>
            </div>
            <span className="collapsible-indicator" aria-hidden="true">+</span>
          </summary>
        <form action={addEmployeeAction}>
          <input type="hidden" name="companyCode" value={company} />
          <div className="form-grid">
            <div className="field">
              <label>Full Name</label>
              <input name="fullName" type="text" required />
            </div>
            <div className="field">
              <label>Email</label>
              <input name="email" type="email" />
            </div>
            <div className="field">
              <label>Designation</label>
              <input name="designation" type="text" required />
            </div>
            <div className="field">
              <label>Department</label>
              <input name="department" type="text" />
            </div>
            <div className="field">
              <label>Region</label>
              <select name="region" defaultValue="">
                <option value="">Select region</option>
                <option value="India">India</option>
                <option value="UAE">UAE</option>
                <option value="Kenya">Kenya</option>
                <option value="UK">UK</option>
                <option value="US">US</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Employment Type</label>
              <select name="employmentType" defaultValue="full_time" required>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>
            <div className="field">
              <label>Base Salary (monthly)</label>
              <input name="baseSalary" type="number" min="0" step="0.01" required />
            </div>
            <div className="field">
              <label>Currency</label>
              <select name="salaryCurrency" defaultValue={defaultCurrency} required>
                <option value="INR">INR (Indian Rupee)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="AED">AED (UAE Dirham)</option>
                <option value="KES">KES (Kenyan Shilling)</option>
              </select>
            </div>
            <div className="form-actions">
              <SubmitButton pendingLabel="Adding…">Add employee</SubmitButton>
            </div>
          </div>
        </form>
        </details>
      </article>

      {/* Employee table */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Directory</span>
            <h3>Employees — {company}</h3>
          </div>
          <span className="badge">{totalCount} records</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Designation</th>
                <th>Dept</th>
                <th>Region</th>
                <th>Type</th>
                <th>Salary</th>
                <th>Status</th>
                <th>Update salary</th>
                <th>Change status</th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((emp) => (
                  <tr key={emp.id} data-row-id={emp.id}>
                    <td><strong>{emp.fullName}</strong></td>
                    <td className="muted">{emp.email || "—"}</td>
                    <td>{emp.designation}</td>
                    <td>{emp.department || "—"}</td>
                    <td>{emp.region ? <span className="pill subtle-pill">{emp.region}</span> : <span className="muted">—</span>}</td>
                    <td><span className="pill subtle-pill">{emp.employmentType}</span></td>
                    <td>
                      <strong>{emp.baseSalary}</strong>
                      <br />
                      <span className="muted">{emp.salaryCurrency}/mo</span>
                    </td>
                    <td>
                      <span className={statusPillClass(emp.status)}>{emp.status}</span>
                    </td>
                    <td>
                      <form action={updateSalaryAction} className="inline-actions">
                        <input type="hidden" name="employeeId" value={emp.id} />
                        <input type="hidden" name="company" value={company} />
                        <input
                          name="baseSalary"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(emp.rawBaseSalary)}
                          required
                        />
                        <select name="salaryCurrency" defaultValue={emp.salaryCurrency} aria-label="Salary currency">
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                          <option value="AED">AED</option>
                          <option value="KES">KES</option>
                        </select>
                        <button className="action-button secondary" type="submit">Set</button>
                      </form>
                    </td>
                    <td>
                      <form action={updateEmployeeStatusAction} className="inline-actions">
                        <input type="hidden" name="employeeId" value={emp.id} />
                        <input type="hidden" name="company" value={company} />
                        <select name="newStatus" defaultValue="" aria-label="Employee status">
                          <option value="" disabled>Change...</option>
                          <option value="active">Active</option>
                          <option value="on_leave">On leave</option>
                          <option value="notice_period">Notice</option>
                          <option value="terminated">Terminated</option>
                        </select>
                        <button className="action-button secondary" type="submit">Set</button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} style={{ padding: 0 }}>
                    <EmptyState
                      title={`No employees for ${company}`}
                      description="Open the 'Add employee' section above to register a new hire. Employees sync to the payroll generator automatically."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
