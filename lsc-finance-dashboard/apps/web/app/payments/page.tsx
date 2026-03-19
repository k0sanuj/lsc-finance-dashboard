import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth";

export default async function PaymentsIndexPage() {
  await requireRole(["super_admin", "finance_admin"]);
  redirect("/payments/TBR");
}
