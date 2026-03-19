import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth";

export default async function CostsIndexPage() {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  redirect("/costs/TBR");
}
