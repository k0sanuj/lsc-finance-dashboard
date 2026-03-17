import { getEntitySnapshots } from "@lsc/db";
import { CompanySelectionIndex } from "../components/company-selection-index";
import { requireRole } from "../../lib/auth";

export default async function PaymentsIndexPage() {
  await requireRole(["super_admin", "finance_admin"]);
  const entitySnapshots = await getEntitySnapshots();

  return (
    <div className="page-grid">
      <CompanySelectionIndex
        basePath="/payments"
        companySnapshots={entitySnapshots}
        description="Pick the company first. Due tracking, source invoices, and settlement views should only load after you choose the operating entity."
        eyebrow="Payments"
        title="Choose the company before you open payment operations."
      />
    </div>
  );
}
