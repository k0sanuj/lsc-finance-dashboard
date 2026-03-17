export type WorkflowStage = {
  id: string;
  name: string;
  owner: string;
};

export type WorkflowBranch = {
  name: string;
  steps: string[];
};

export const workflowStages: WorkflowStage[] = [
  { id: "planning", name: "Planning", owner: "Finance Overlord" },
  { id: "metrics", name: "Metric Definition", owner: "Finance Architect" },
  { id: "ontology", name: "Ontology Design", owner: "Ontology Architect" },
  { id: "schema", name: "Schema Design", owner: "Schema Engineer" },
  { id: "import", name: "Raw Import", owner: "Import Engineer" },
  { id: "normalization", name: "Normalization", owner: "Import Engineer" },
  { id: "canonical", name: "Canonical Records", owner: "Schema Engineer" },
  { id: "analytics", name: "Analytics Views", owner: "View Builder" },
  { id: "services", name: "APIs + Services", owner: "App Engineer" },
  { id: "rendering", name: "Dashboard Rendering", owner: "UI Engineer" },
  { id: "qa", name: "QA Validation", owner: "QA Debug Agent" },
  { id: "ai", name: "AI Interpretation", owner: "AI Analysis Agent" }
] as const;

export const workflowBranches: WorkflowBranch[] = [
  {
    name: "TBR Expense Flow",
    steps: [
      "Expense report received",
      "Source document registered",
      "Race mapping",
      "Category mapping",
      "Approval status",
      "Canonical expense creation",
      "Payment or reimbursement tracking",
      "Dashboard update"
    ]
  },
  {
    name: "Sponsorship Revenue Flow",
    steps: [
      "Contract intake",
      "Sponsor mapping",
      "Invoice creation",
      "Payment collection",
      "Revenue recognition",
      "Receivables update",
      "Overview and TBR update",
      "Commercial goals update"
    ]
  },
  {
    name: "Payments Flow",
    steps: [
      "Payable invoice recorded",
      "Due date assigned",
      "Status tracked",
      "Payment executed",
      "Payment record linked",
      "Dashboard updated"
    ]
  }
] as const;
