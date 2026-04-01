import {
  getInboundMessages,
  getOutboundMessages,
  getMessagingSummary
} from "@lsc/db";
import { requireRole } from "../../lib/auth";

function priorityPill(priority: string) {
  switch (priority) {
    case "critical":
      return "signal-pill signal-risk";
    case "high":
      return "signal-pill signal-warn";
    case "normal":
      return "signal-pill signal-good";
    default:
      return "subtle-pill";
  }
}

function statusPill(isProcessed: boolean) {
  return isProcessed ? "signal-pill signal-good" : "signal-pill signal-warn";
}

export default async function MessagingPage() {
  await requireRole(["super_admin", "finance_admin"]);

  const [inbound, outbound, summary] = await Promise.all([
    getInboundMessages(),
    getOutboundMessages(),
    getMessagingSummary()
  ]);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Platform messaging</span>
          <h3>Cross-Dashboard Messages</h3>
          <p className="muted">Communication between Finance and Legal dashboards</p>
        </div>
      </section>

      <section className="stats-grid compact-stats">
        <article className="metric-card accent-brand">
          <div className="metric-topline">
            <span className="metric-label">Total inbound</span>
          </div>
          <div className="metric-value">{summary.totalInbound}</div>
          <span className="metric-subvalue">From Legal</span>
        </article>
        <article className="metric-card accent-good">
          <div className="metric-topline">
            <span className="metric-label">Total outbound</span>
          </div>
          <div className="metric-value">{summary.totalOutbound}</div>
          <span className="metric-subvalue">To Legal</span>
        </article>
        <article className="metric-card accent-warn">
          <div className="metric-topline">
            <span className="metric-label">Unprocessed</span>
          </div>
          <div className="metric-value">{summary.unprocessed}</div>
          <span className="metric-subvalue">Awaiting action</span>
        </article>
        <article className="metric-card accent-risk">
          <div className="metric-topline">
            <span className="metric-label">Critical pending</span>
          </div>
          <div className="metric-value">{summary.critical}</div>
          <span className="metric-subvalue">Immediate attention</span>
        </article>
      </section>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Inbound</span>
            <h3>Messages from Legal dashboard</h3>
          </div>
          <span className="pill">{inbound.length} received</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>Intent</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Received</th>
                <th>Payload preview</th>
              </tr>
            </thead>
            <tbody>
              {inbound.length > 0 ? (
                inbound.map((msg) => (
                  <tr key={msg.id}>
                    <td>{msg.fromSystem}</td>
                    <td>{msg.intent}</td>
                    <td>
                      <span className={`pill ${priorityPill(msg.priority)}`}>
                        {msg.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${statusPill(msg.isProcessed)}`}>
                        {msg.isProcessed ? "processed" : "pending"}
                      </span>
                    </td>
                    <td>{msg.createdAt}</td>
                    <td className="muted">{msg.payloadPreview}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={6}>
                    No messages received from Legal dashboard yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <div className="card-title-row">
          <div>
            <span className="section-kicker">Outbound</span>
            <h3>Messages to Legal dashboard</h3>
          </div>
          <span className="pill">{outbound.length} sent</span>
        </div>
        <div className="table-wrapper clean-table">
          <table>
            <thead>
              <tr>
                <th>To</th>
                <th>Intent</th>
                <th>Priority</th>
                <th>Requires Response</th>
                <th>Sent</th>
                <th>Payload preview</th>
              </tr>
            </thead>
            <tbody>
              {outbound.length > 0 ? (
                outbound.map((msg) => (
                  <tr key={msg.id}>
                    <td>{msg.toSystem}</td>
                    <td>{msg.intent}</td>
                    <td>
                      <span className={`pill ${priorityPill(msg.priority)}`}>
                        {msg.priority}
                      </span>
                    </td>
                    <td>
                      <span className="badge">
                        {msg.requiresResponse ? "Yes" : "No"}
                      </span>
                    </td>
                    <td>{msg.createdAt}</td>
                    <td className="muted">{msg.payloadPreview}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted" colSpan={6}>
                    No messages sent to Legal dashboard yet.
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
