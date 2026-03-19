import { redirect } from "next/navigation";
import { requireRole } from "../../lib/auth";

export default async function DocumentsIndexPage() {
  await requireRole(["super_admin", "finance_admin"]);
  redirect("/documents/TBR");
}
