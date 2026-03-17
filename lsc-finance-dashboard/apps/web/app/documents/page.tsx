import { getEntitySnapshots } from "@lsc/db";
import { CompanySelectionIndex } from "../components/company-selection-index";
import { requireRole } from "../../lib/auth";

export default async function DocumentsIndexPage() {
  await requireRole(["super_admin", "finance_admin"]);
  const entitySnapshots = await getEntitySnapshots();

  return (
    <div className="page-grid">
      <CompanySelectionIndex
        basePath="/documents"
        companySnapshots={entitySnapshots}
        description="Choose the company first. Document intake, analysis queues, and approval detail should only appear inside the selected company workspace."
        eyebrow="Documents"
        title="Choose the company before you open document operations."
      />
    </div>
  );
}
