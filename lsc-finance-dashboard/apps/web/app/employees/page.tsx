import { requireRole } from "../../lib/auth";
import { getEmployees } from "@lsc/db";
import { addEmployeeAction, updateEmployeeStatusAction } from "./actions";

const COMPANIES = ["XTZ", "XTE", "TBR", "FSP"];

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

  const employees = await getEmployees(company);

  const totalCount = employees.length;
  const activeCount = employees.filter((e) => e.status === "active").length;
  const onLeaveCount = employees.filter((e) => e.status === "on leave").length;
  const terminatedCount = employees.filter((e) => e.status === "terminated").length;

  function statusPillClass(s: string): string {
    switch (s) {
      case "active":
        return "signal-pill signal-good";
      case "on leave":
        return "signal-pill signal-warn";
      case "terminated":
        return "signal-pill signal-risk";
      case "notice period":
        return "signal-pill signal-warn";
      default:
        return "pill";
    }
  }

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">People &amp; payroll</span>
          <h2>Employee Management</h2>
        </div>
      </section>

      {/* Company filter */}
      <nav style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
      <div className="stats-grid compact-stats">
        <div className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total employees</span>
          </div>
          <span className="metric-value">{totalCount}</span>
          <span className="metric-subvalue">{company}</span>
        </div>
        <div className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Active</span>
          </div>
          <span className="metric-value">{activeCount}</span>
        </div>
        <div className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">On leave</span>
          </div>
          <span className="metric-value">{onLeaveCount}</span>
        </div>
        <div className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Terminated</span>
          </div>
          <span className="metric-value">{terminatedCount}</span>
        </div>
      </div>

      {/* Status/message notice */}
      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      {/* Add employee form */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">New hire</span>
            <h3>Add employee</h3>
          </div>
        </div>
        <form action={addEmployeeAction} className="stack-form">
          <input type="hidden" name="companyCode" value={company} />
          <div
            className="form-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
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
              <label>Employment Type</label>
              <select name="employmentType" defaultValue="full_time" required>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>
            <div className="field">
              <label>Base Salary</label>
              <input name="baseSalary" type="number" min="0" step="0.01" required />
            </div>
            <div className="field">
              <label>Currency</label>
              <select name="salaryCurrency" defaultValue="INR" required>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
                <option value="KES">KES</option>
              </select>
            </div>
          </div>
          <button className="action-button primary" type="submit" style={{ marginTop: "1rem" }}>
            Add employee
          </button>
        </form>
      </article>

      {/* Employee table */}
      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Directory</span>
            <h3>Employees &mdash; {company}</h3>
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
                <th>Department</th>
                <th>Type</th>
                <th>Salary</th>
                <th>Currency</th>
                <th>Start Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <strong>{emp.fullName}</strong>
                    </td>
                    <td className="muted">{emp.email}</td>
                    <td>{emp.designation}</td>
                    <td>{emp.department}</td>
                    <td>
                      <span className="pill subtle-pill">{emp.employmentType}</span>
                    </td>
                    <td>{emp.baseSalary}</td>
                    <td>{emp.salaryCurrency}</td>
                    <td>{emp.startDate}</td>
                    <td>
                      <span className={statusPillClass(emp.status)}>{emp.status}</span>
                    </td>
                    <td>
                      <form action={updateEmployeeStatusAction} className="inline-actions">
                        <input type="hidden" name="employeeId" value={emp.id} />
                        <select name="newStatus" defaultValue="">
                          <option value="" disabled>
                            Change...
                          </option>
                          <option value="active">Active</option>
                          <option value="on_leave">On leave</option>
                          <option value="notice_period">Notice period</option>
                          <option value="terminated">Terminated</option>
                        </select>
                        <button className="action-button secondary" type="submit">
                          Update
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={10}>
                    No employees found for {company}.
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
