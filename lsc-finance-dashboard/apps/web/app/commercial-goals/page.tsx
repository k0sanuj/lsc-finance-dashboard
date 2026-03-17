import { getEntitySnapshots } from "@lsc/db";
import { CompanySelectionIndex } from "../components/company-selection-index";
import { requireRole } from "../../lib/auth";

export default async function CommercialGoalsIndexPage() {
  await requireRole(["super_admin", "finance_admin", "commercial_user"]);
  const entitySnapshots = await getEntitySnapshots();

  return (
    <div className="page-grid">
      <CompanySelectionIndex
        basePath="/commercial-goals"
        companySnapshots={entitySnapshots}
        description="Choose the company first. Snapshot, targets, and owner accountability should only load inside the selected commercial workspace."
        eyebrow="Commercial goals"
        title="Choose the company before you open commercial planning."
      />
    </div>
  );
}
