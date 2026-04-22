import { requireRole } from "../../lib/auth";
import { CopilotChat } from "./copilot-chat";

export default async function CopilotPage() {
  await requireRole(["super_admin", "finance_admin"]);

  return (
    <div className="page-grid">
      <section className="workspace-header">
        <div className="workspace-header-left">
          <span className="section-kicker">Finance Copilot</span>
          <h3>Ask any question about the platform — the orchestrator routes it to the right agent.</h3>
        </div>
      </section>

      <CopilotChat />
    </div>
  );
}
