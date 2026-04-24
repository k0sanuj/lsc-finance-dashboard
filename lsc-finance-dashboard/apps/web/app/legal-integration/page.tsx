import { requireRole } from "../../lib/auth";
import { listLegalApiKeys, listLegalWebhookEvents } from "@lsc/db";
import {
  generateLegalApiKeyAction,
  revokeLegalApiKeyAction,
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

function eventStatusTone(status: string): string {
  if (status === "processed") return "signal-good";
  if (status === "duplicate") return "signal-warn";
  if (status === "failed" || status === "rejected") return "signal-risk";
  return "signal-warn";
}

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
    newSecret?: string;
    newPrefix?: string;
  }>;
};

export default async function LegalIntegrationPage({
  searchParams,
}: PageProps) {
  await requireRole(["super_admin", "finance_admin"]);
  const resolved = searchParams ? await searchParams : undefined;

  const [keys, events] = await Promise.all([
    listLegalApiKeys(),
    listLegalWebhookEvents(100),
  ]);

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="page-grid">
      <header className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Integrations</span>
          <h3>Legal Platform</h3>
          <p className="muted">
            Issue API keys for the Legal dashboard so it can push tranche and
            share-grant events into Finance via{" "}
            <code>POST /api/legal/webhook</code>. Events are HMAC-signed and
            idempotent on eventId.
          </p>
        </div>
      </header>

      {resolved?.message ? (
        <div
          className={`notice ${resolved.status === "error" ? "error" : "success"}`}
        >
          <strong>
            {resolved.status === "error" ? "Action failed" : "Update"}
          </strong>
          <span>{decodeURIComponent(resolved.message)}</span>
        </div>
      ) : null}

      {resolved?.newSecret ? (
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">One-time secret</span>
              <h3>Save this secret now</h3>
            </div>
            <span className="signal-pill signal-warn">show once</span>
          </div>
          <p className="muted">
            Paste this into the Legal platform&rsquo;s <code>.env</code> as
            <code> LSC_FINANCE_WEBHOOK_SECRET</code>. We do NOT store it in
            plaintext — if you lose it, revoke the key and generate a new one.
          </p>
          <pre className="legal-secret-box">{resolved.newSecret}</pre>
          <p className="muted legal-secret-prefix">
            Prefix: <code>{resolved.newPrefix}</code>
          </p>
        </article>
      ) : null}

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">New key</span>
            <h3>Generate an API key</h3>
          </div>
        </div>
        <form action={generateLegalApiKeyAction} className="form-grid">
          <div className="field field-span-full">
            <label htmlFor="legal-key-label">Label</label>
            <input
              id="legal-key-label"
              name="label"
              type="text"
              required
              placeholder='e.g. "Legal dashboard — prod"'
            />
          </div>
          <div className="form-actions">
            <button className="action-button primary" type="submit">
              Generate key
            </button>
          </div>
        </form>
      </article>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Keys</span>
            <h3>Active keys</h3>
          </div>
          <span className="badge">{activeKeys.length}</span>
        </div>
        {activeKeys.length === 0 ? (
          <p className="muted">
            No active keys. Generate one above and paste it into the Legal
            dashboard&rsquo;s env file.
          </p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Prefix</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th className="text-right">Uses</th>
                  <th>
                    <span className="sr-only">Revoke</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeKeys.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <strong>{k.label}</strong>
                    </td>
                    <td>
                      <code>{k.keyPrefix}</code>
                    </td>
                    <td>{formatTimestamp(k.createdAt)}</td>
                    <td>{formatTimestamp(k.lastUsedAt)}</td>
                    <td className="text-right">{k.usageCount}</td>
                    <td>
                      <form action={revokeLegalApiKeyAction}>
                        <input type="hidden" name="keyId" value={k.id} />
                        <button
                          className="action-button risk"
                          type="submit"
                          aria-label={`Revoke ${k.label}`}
                        >
                          Revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {revokedKeys.length > 0 && (
        <article className="card">
          <div className="card-title-row">
            <div>
              <span className="section-kicker">Revoked</span>
              <h3>Revoked keys</h3>
            </div>
            <span className="badge">{revokedKeys.length}</span>
          </div>
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Prefix</th>
                  <th>Revoked</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {revokedKeys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.label}</td>
                    <td>
                      <code>{k.keyPrefix}</code>
                    </td>
                    <td>{formatTimestamp(k.revokedAt)}</td>
                    <td>{k.revocationReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Inbound events</span>
            <h3>Recent webhook deliveries</h3>
          </div>
          <span className="badge">{events.length}</span>
        </div>
        {events.length === 0 ? (
          <p className="muted">
            No webhook events yet. The Legal platform will start sending here
            once it&rsquo;s wired up with a key.
          </p>
        ) : (
          <div className="table-wrapper clean-table">
            <table>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Signature</th>
                  <th>Entity</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{formatTimestamp(e.createdAt)}</td>
                    <td>
                      <code>{e.eventType}</code>
                      {e.externalEventId ? (
                        <>
                          <br />
                          <span className="muted qb-category-code">
                            {e.externalEventId}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`signal-pill ${eventStatusTone(e.status)}`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td>
                      {e.signatureVerified ? (
                        <span className="signal-pill signal-good">ok</span>
                      ) : (
                        <span className="signal-pill signal-risk">fail</span>
                      )}
                    </td>
                    <td>
                      {e.targetEntityType ? (
                        <>
                          {e.targetEntityType}
                          {e.targetEntityId ? (
                            <>
                              <br />
                              <span className="muted qb-category-code">
                                {e.targetEntityId.slice(0, 8)}…
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {e.errorMessage ? (
                        <span className="muted qb-category-code">
                          {e.errorMessage.length > 80
                            ? e.errorMessage.slice(0, 80) + "…"
                            : e.errorMessage}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}
