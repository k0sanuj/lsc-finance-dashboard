import { requireRole } from "../../lib/auth";
import { AnalyzersShell } from "./analyzers-shell";

export default async function AnalyzersPage() {
  await requireRole(["super_admin", "finance_admin"]);
  return <AnalyzersShell />;
}
