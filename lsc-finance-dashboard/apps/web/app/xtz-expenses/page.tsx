import type { Route } from "next";
import Link from "next/link";
import { queryRows } from "@lsc/db";
import { formatCurrency, formatDateLabel, getBackend } from "@lsc/db";
import { requireRole } from "../../lib/auth";
import { submitExpenseAction, reviewExpenseAction } from "./actions";
import { getCompanyOptions } from "../lib/entities";

type XtzExpensesPageProps = {
  searchParams?: Promise<{ view?: string; status?: string; message?: string }>;
};

type ExpenseQueueRow = {
  id: string;
  title: string;
  submitterName: string;
  status: string;
  billingEntity: string;
  reimbursingEntity: string;
  taggedBrand: string;
  submittedAt: string;
  totalAmount: string;
  currency: string;
  reviewNote: string;
};

const BRAND_OPTIONS = [
  { value: "", label: "Select brand..." },
  { value: "LSC", label: "LSC (League Sports Co)" },
  { value: "TBR", label: "TBR (Team Blue Rising)" },
  { value: "FSP", label: "FSP (Future of Sports)" },
  { value: "Basketball", label: "Basketball" },
  { value: "Bowling", label: "Bowling (World Bowling League)" },
  { value: "Squash", label: "Squash" },
  { value: "World Pong", label: "World Pong" },
  { value: "General", label: "General / Corporate" }
];

const ENTITY_OPTIONS = [
  ...getCompanyOptions(["XTZ", "LSC", "TBR"] as const)
];

async function getXtzExpenseQueue(): Promise<ExpenseQueueRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    submission_title: string;
    submitter_name: string;
    submission_status: string;
    billing_entity: string | null;
    reimbursing_entity: string | null;
    tagged_brand: string | null;
    submitted_at: string | null;
    total_amount: string;
    currency_code: string;
    review_note: string | null;
  }>(
    `select es.id, es.submission_title,
            au.full_name as submitter_name,
            es.submission_status,
            bc.name as billing_entity,
            rc.name as reimbursing_entity,
            es.tagged_brand,
            es.submitted_at::text,
            coalesce(sum(esi.amount), 0)::numeric(14,2)::text as total_amount,
            coalesce(max(esi.currency_code), 'INR') as currency_code,
            es.review_note
     from expense_submissions es
     join app_users au on au.id = es.submitted_by_user_id
     left join companies bc on bc.id = es.billing_entity_id
     left join companies rc on rc.id = es.reimbursing_entity_id
     left join expense_submission_items esi on esi.submission_id = es.id
     where es.company_id = (select id from companies where code = 'XTZ'::company_code)
     group by es.id, es.submission_title, au.full_name, es.submission_status,
              bc.name, rc.name, es.tagged_brand, es.submitted_at, es.review_note
     order by es.submitted_at desc nulls last`
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.submission_title,
    submitterName: r.submitter_name,
    status: r.submission_status.replace(/_/g, " "),
    billingEntity: r.billing_entity ?? "—",
    reimbursingEntity: r.reimbursing_entity ?? "—",
    taggedBrand: r.tagged_brand ?? "—",
    submittedAt: formatDateLabel(r.submitted_at),
    totalAmount: formatCurrency(r.total_amount),
    currency: r.currency_code,
    reviewNote: r.review_note ?? ""
  }));
}

function statusPill(s: string): string {
  if (s === "submitted" || s === "in review") return "signal-pill signal-warn";
  if (s === "approved" || s === "posted") return "signal-pill signal-good";
  if (s === "rejected") return "signal-pill signal-risk";
  if (s === "needs clarification") return "signal-pill signal-warn";
  return "subtle-pill";
}

export default async function XtzExpensesPage({ searchParams }: XtzExpensesPageProps) {
  await requireRole(["super_admin", "finance_admin", "team_member"]);

  const params = searchParams ? await searchParams : undefined;
  const view = params?.view === "review" ? "review" : "submit";
  const status = params?.status ?? null;
  const message = params?.message ?? null;

  const queue = await getXtzExpenseQueue();

  const totalSubmissions = queue.length;
  const pending = queue.filter((e) => e.status === "submitted" || e.status === "in review").length;
  const approved = queue.filter((e) => e.status === "approved" || e.status === "posted").length;

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">XTZ India — expense reimbursement</span>
          <h3>Expense Claims</h3>
          <div className="inline-actions">
            <Link
              className={`segment-chip ${view === "submit" ? "active" : ""}`}
              href={"/xtz-expenses?view=submit" as Route}
            >
              Submit expense
            </Link>
            <Link
              className={`segment-chip ${view === "review" ? "active" : ""}`}
              href={"/xtz-expenses?view=review" as Route}
            >
              Review queue
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <section className={`notice ${status ?? "info"}`}>
          <strong>{status === "error" ? "Error" : "Done"}</strong>
          <span>{message}</span>
        </section>
      ) : null}

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline"><span className="metric-label">Total claims</span></div>
          <div className="metric-value">{totalSubmissions}</div>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline"><span className="metric-label">Pending review</span></div>
          <div className="metric-value">{pending}</div>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline"><span className="metric-label">Approved</span></div>
          <div className="metric-value">{approved}</div>
        </article>
      </section>

      {view === "submit" ? (
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">New claim</span>
              <h3>Submit expense for reimbursement</h3>
            </div>
          </div>
          <form action={submitExpenseAction}>
            <div className="form-grid">
              <div className="field">
                <label>Expense title</label>
                <input name="title" type="text" placeholder="e.g. Travel to Jeddah, Office supplies" required />
              </div>
              <div className="field">
                <label>Merchant / vendor</label>
                <input name="merchantName" type="text" placeholder="e.g. Emirates Airlines, Amazon" />
              </div>
              <div className="field">
                <label>Expense date</label>
                <input name="expenseDate" type="date" required />
              </div>
              <div className="field">
                <label>Amount</label>
                <input name="amount" type="number" min="0" step="0.01" required />
              </div>
              <div className="field">
                <label>Currency</label>
                <select name="currency" defaultValue="INR">
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="AED">AED</option>
                  <option value="KES">KES</option>
                </select>
              </div>
              <div className="field">
                <label>Who paid? (billing entity)</label>
                <select name="billingEntity" defaultValue="XTZ" aria-label="Billing entity">
                  {ENTITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Who reimburses?</label>
                <select name="reimbursingEntity" defaultValue="XTZ" aria-label="Reimbursing entity">
                  {ENTITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Which brand is this for?</label>
                <select name="taggedBrand" defaultValue="" aria-label="Tagged brand">
                  {BRAND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Description</label>
                <input name="description" type="text" placeholder="What was this expense for?" />
              </div>
              <div className="field">
                <label>Notes for reviewer</label>
                <input name="operatorNote" type="text" placeholder="Any context for the finance team" />
              </div>
              <div className="form-actions">
                <button className="action-button primary" type="submit">Submit expense</button>
              </div>
            </div>
          </form>
        </article>
      ) : null}

      {view === "review" ? (
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Review queue</span>
              <h3>All XTZ expense claims</h3>
            </div>
            <span className="badge">{queue.length} claims</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Submitted by</th>
                  <th>Amount</th>
                  <th>Paid by</th>
                  <th>Reimburse from</th>
                  <th>Brand</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.length > 0 ? (
                  queue.map((e) => (
                    <tr key={e.id}>
                      <td><strong>{e.title}</strong></td>
                      <td>{e.submitterName}</td>
                      <td>{e.totalAmount} <span className="muted">{e.currency}</span></td>
                      <td><span className="pill subtle-pill">{e.billingEntity}</span></td>
                      <td><span className="pill subtle-pill">{e.reimbursingEntity}</span></td>
                      <td>
                        {e.taggedBrand !== "—" ? (
                          <span className="badge">{e.taggedBrand}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{e.submittedAt}</td>
                      <td><span className={`pill ${statusPill(e.status)}`}>{e.status}</span></td>
                      <td>
                        {e.status === "submitted" || e.status === "in review" || e.status === "needs clarification" ? (
                          <form action={reviewExpenseAction} className="inline-actions">
                            <input type="hidden" name="submissionId" value={e.id} />
                            <select name="newStatus" defaultValue="" aria-label="Review action">
                              <option value="" disabled>Action...</option>
                              <option value="in_review">In review</option>
                              <option value="approved">Approve</option>
                              <option value="needs_clarification">Need info</option>
                              <option value="rejected">Reject</option>
                            </select>
                            <input name="reviewNote" type="text" placeholder="Note" />
                            <button className="action-button secondary" type="submit">Go</button>
                          </form>
                        ) : (
                          <span className="muted">{e.status}</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted" colSpan={9}>No expense claims submitted yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </div>
  );
}
