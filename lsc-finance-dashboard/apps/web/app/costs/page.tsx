import { getEntitySnapshots } from "@lsc/db";
import { CompanySelectionIndex } from "../components/company-selection-index";
import { requireRole } from "../../lib/auth";

export default async function CostsIndexPage() {
  await requireRole(["super_admin", "finance_admin", "viewer"]);
  const entitySnapshots = await getEntitySnapshots();

  return (
    <div className="page-grid">
      <CompanySelectionIndex
        basePath="/costs"
        companySnapshots={entitySnapshots}
        description="Start with the company. Cost tables, charts, source analysis, and AI commentary should only appear after you choose TBR or FSP."
        eyebrow="Costs"
        title="Choose the company before you open cost operations."
      />
    </div>
  );
}
