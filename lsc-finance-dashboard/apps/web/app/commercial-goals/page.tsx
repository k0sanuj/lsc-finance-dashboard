import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth";

export default async function CommercialGoalsIndexPage() {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);
  redirect("/commercial-goals/TBR");
}
