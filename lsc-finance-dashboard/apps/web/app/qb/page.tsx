import { requireRole } from "../../lib/auth";
import {
  getActiveQbConnections,
  getQbAccountMappings,
  getQbAccounts,
  type QbAccountMappingRow,
  type QbAccountRow,
} from "@lsc/db";
import {
  disconnectQbAction,
  saveQbAccountMappingAction,
  syncChartOfAccountsAction,
} from "./actions";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtCurrency(v: number | null, ccy: string | null): string {
  if (v === null) return "—";
  try {
    return v.toLocaleString("en-US", {
      style: "currency",
      currency: ccy ?? "USD",
      maximumFractionDigits: 2,
    });
  } catch {
    return `${ccy ?? ""} ${v.toFixed(2)}`.trim();
  }
}

function groupByClassification(
  accounts: QbAccountRow[]
): Array<{ classification: string; rows: QbAccountRow[] }> {
  const buckets = new Map<string, QbAccountRow[]>();
  for (const a of accounts) {
    const key = a.classification ?? "Uncategorized";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }
  const order = ["Asset", "Liability", "Equity", "Revenue", "Expense", "Uncategorized"];
  return [...buckets.entries()]
    .sort(
      (a, b) =>
        (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) -
        (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0]))
    )
    .map(([classification, rows]) => ({ classification, rows }));
}

type PageProps = {
  searchParams?: Promise<{ status?: string; message?: string }>;
};

export default async function QuickBooksPage({ searchParams }: PageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const resolved = searchParams ? await searchParams : undefined;
  const status = resolved?.status ?? null;
  const message = resolved?.message ?? null;

  const connections = await getActiveQbConnections();
  const primary = connections[0] ?? null;
  const [accounts, mappings] = primary
    ? await Promise.all([
        getQbAccounts(primary.id),
        getQbAccountMappings(primary.id),
      ])
    : [[] as QbAccountRow[], [] as QbAccountMappingRow[]];
  const grouped = groupByClassification(accounts);

  // Split accounts into debit-candidates (Expense classification, typically)
  // and credit-candidates (Asset, Liability) for the mapping dropdowns.
  // We don't strictly enforce this — just bias the default ordering.
  const activeAccounts = accounts.filter((a) => a.isActive);
  const debitAccounts = [
    ...activeAccounts.filter((a) => a.classification === "Expense"),
    ...activeAccounts.filter((a) => a.classification !== "Expense"),
  ];
  const creditAccounts = [
    ...activeAccounts.filter((a) => a.classification === "Liability"),
    ...activeAccounts.filter((a) => a.classification === "Asset"),
    ...activeAccounts.filter(
      (a) => a.classification !== "Liability" && a.classification !== "Asset"
    ),
  ];
  const mappedCount = mappings.filter((m) => m.debitQbAccountId !== "").length;

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Integrations</span>
          <h3>QuickBooks Online</h3>
          <p className="muted">
            Connect a QuickBooks company to sync the Chart of Accounts and
            post journal entries on expense approvals. Runs against the
            sandbox environment in dev.
          </p>
        </div>
      </header>

      {message ? (
        <div className={`notice ${status === "error" ? "error" : "success"}`}>
          <strong>{status === "error" ? "Action failed" : "Update"}</strong>
          <span>{decodeURIComponent(message)}</span>
        </div>
      ) : null}

      {!primary ? (
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Not connected</span>
              <h3>Link a QuickBooks company</h3>
            </div>
          </div>
          <p className="muted">
            You&rsquo;ll be redirected to Intuit&rsquo;s consent screen to
            authorize this app against your sandbox company. On return, we
            store encrypted OAuth tokens and enable Chart of Accounts sync.
          </p>
          <div className="actions-row">
            <a className="action-button primary" href="/api/qb/connect">
              Connect to QuickBooks
            </a>
          </div>
        </article>
      ) : (
        <>
          <article className="card">
            <div className="card-title-row">
              <div>
                <span className="section-kicker">Active connection</span>
                <h3>
                  {primary.companyName ?? `Realm ${primary.realmId}`}
                </h3>
              </div>
              <span
                className={`signal-pill ${
                  primary.environment === "sandbox"
                    ? "signal-warn"
                    : "signal-good"
                }`}
              >
                {primary.environment}
              </span>
            </div>
            <div className="mini-metric-grid">
              <div className="mini-metric">
                <span>Realm ID</span>
                <strong>{primary.realmId}</strong>
              </div>
              <div className="mini-metric">
                <span>Connected</span>
                <strong>{formatTimestamp(primary.connectedAt)}</strong>
              </div>
              <div className="mini-metric">
                <span>Last refreshed</span>
                <strong>{formatTimestamp(primary.lastRefreshedAt)}</strong>
              </div>
              <div className="mini-metric">
                <span>Last synced</span>
                <strong>{formatTimestamp(primary.lastSyncedAt)}</strong>
              </div>
              <div className="mini-metric">
                <span>Accounts mirrored</span>
                <strong>{accounts.length}</strong>
              </div>
              <div className="mini-metric">
                <span>Refresh token expires</span>
                <strong>
                  {formatTimestamp(primary.refreshTokenExpiresAt)}
                </strong>
              </div>
            </div>

            <div className="actions-row">
              <form action={syncChartOfAccountsAction}>
                <input type="hidden" name="realmId" value={primary.realmId} />
                <button className="action-button primary" type="submit">
                  Sync Chart of Accounts
                </button>
              </form>
              <a className="action-button secondary" href="/api/qb/connect">
                Re-authorize
              </a>
              <form action={disconnectQbAction}>
                <input
                  type="hidden"
                  name="connectionId"
                  value={primary.id}
                />
                <button className="action-button risk" type="submit">
                  Disconnect
                </button>
              </form>
            </div>
          </article>

          {accounts.length > 0 && (
            <article className="card">
              <div className="card-title-row">
                <div>
                  <span className="section-kicker">Phase 3 · Posting</span>
                  <h3>Cost-category → GL account mapping</h3>
                  <p className="muted qb-mapping-hint">
                    When an expense is approved, a journal entry posts to
                    QuickBooks using these mappings. Debit = the expense GL
                    account; credit = the cash / accrual account that
                    funds it. Unmapped categories block JE posting.
                  </p>
                </div>
                <span className="badge">
                  {mappedCount}/{mappings.length} mapped
                </span>
              </div>
              <div className="table-wrapper clean-table">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Scope</th>
                      <th>Debit account (expense)</th>
                      <th>Credit account (cash / accrual)</th>
                      <th>Notes</th>
                      <th>
                        <span className="sr-only">Save action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => (
                      <tr key={m.costCategoryId}>
                        <td>
                          <strong>{m.costCategoryName}</strong>
                          <br />
                          <span className="muted qb-category-code">
                            {m.costCategoryCode}
                          </span>
                        </td>
                        <td>{m.categoryScope}</td>
                        <td className="qb-mapping-cell" colSpan={4}>
                          <form
                            action={saveQbAccountMappingAction}
                            className="qb-mapping-form"
                          >
                            <input
                              type="hidden"
                              name="connectionId"
                              value={primary.id}
                            />
                            <input
                              type="hidden"
                              name="costCategoryId"
                              value={m.costCategoryId}
                            />
                            <select
                              name="debitQbAccountId"
                              defaultValue={m.debitQbAccountId}
                              title={`Debit account for ${m.costCategoryName}`}
                            >
                              <option value="">— Not mapped —</option>
                              {debitAccounts.map((a) => (
                                <option
                                  key={a.qbAccountId}
                                  value={a.qbAccountId}
                                >
                                  {a.fullyQualifiedName ?? a.accountName}
                                  {a.classification
                                    ? ` (${a.classification})`
                                    : ""}
                                </option>
                              ))}
                            </select>
                            <select
                              name="creditQbAccountId"
                              defaultValue={m.creditQbAccountId ?? ""}
                              title={`Credit account for ${m.costCategoryName}`}
                            >
                              <option value="">— Default / none —</option>
                              {creditAccounts.map((a) => (
                                <option
                                  key={a.qbAccountId}
                                  value={a.qbAccountId}
                                >
                                  {a.fullyQualifiedName ?? a.accountName}
                                  {a.classification
                                    ? ` (${a.classification})`
                                    : ""}
                                </option>
                              ))}
                            </select>
                            <input
                              name="notes"
                              type="text"
                              placeholder="Notes (optional)"
                              defaultValue={m.notes ?? ""}
                              aria-label={`Notes for ${m.costCategoryName}`}
                            />
                            <button
                              className="action-button secondary"
                              type="submit"
                            >
                              Save
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {accounts.length === 0 ? (
            <article className="card">
              <p className="muted">
                No accounts mirrored locally yet. Click <strong>Sync Chart
                of Accounts</strong> to pull them from QuickBooks.
              </p>
            </article>
          ) : (
            grouped.map(({ classification, rows }) => (
              <article className="card" key={classification}>
                <div className="card-title-row">
                  <div>
                    <span className="section-kicker">Chart of Accounts</span>
                    <h3>{classification}</h3>
                  </div>
                  <span className="badge">{rows.length}</span>
                </div>
                <div className="table-wrapper clean-table">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Sub-type</th>
                        <th className="text-right">Balance</th>
                        <th>Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <td>{a.accountNumber ?? "—"}</td>
                          <td>
                            <strong>
                              {a.fullyQualifiedName ?? a.accountName}
                            </strong>
                          </td>
                          <td>{a.accountType}</td>
                          <td>{a.accountSubType ?? "—"}</td>
                          <td className="text-right">
                            {fmtCurrency(a.currentBalance, a.currencyCode)}
                          </td>
                          <td>
                            {a.isActive ? (
                              <span className="signal-pill signal-good">
                                Yes
                              </span>
                            ) : (
                              <span className="signal-pill signal-risk">
                                No
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))
          )}
        </>
      )}
    </div>
  );
}
