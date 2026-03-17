export type SharedCompanyCode = "TBR" | "FSP";

export function getSelectedSharedCompany(value?: string): SharedCompanyCode {
  return value === "FSP" ? "FSP" : "TBR";
}

export function isSharedCompanyCode(value?: string): value is SharedCompanyCode {
  return value === "TBR" || value === "FSP";
}

export function buildCompanyPath(
  basePath: string,
  companyCode: SharedCompanyCode,
  params?: Record<string, string | null | undefined>
) {
  const path = `${basePath}/${companyCode}`;
  if (!params) {
    return path;
  }

  return buildPageHref(path, params);
}

export function formatSharedCompanyName(companyCode: SharedCompanyCode) {
  return companyCode === "TBR" ? "Team Blue Rising" : "Future of Sports";
}

export function buildPageHref(
  basePath: string,
  params: Record<string, string | null | undefined>
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function summarizePaymentContext(value: string | null | undefined) {
  if (!value) {
    return "Operational payable";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  const commentsMatch = normalized.match(/Comments:\s*(.+)$/i);
  if (commentsMatch?.[1]) {
    const comments = commentsMatch[1].trim();
    return comments.length > 110 ? `${comments.slice(0, 107)}...` : comments;
  }

  const workflowPrefix = normalized.replace(/^Workflow:\s*/i, "");
  return workflowPrefix.length > 110 ? `${workflowPrefix.slice(0, 107)}...` : workflowPrefix;
}

export function formatDocumentWorkflowForSelection(
  workflowContext: string | null | undefined,
  proposedTarget: string | null | undefined,
  documentType: string | null | undefined
) {
  const workflow = String(workflowContext ?? "").toLowerCase();
  const target = String(proposedTarget ?? "").toLowerCase();
  const type = String(documentType ?? "").toLowerCase();

  if (
    workflow.includes("expense") ||
    workflow.includes("tbr-race:") ||
    target.includes("expense") ||
    type.includes("expense") ||
    type.includes("receipt")
  ) {
    return "expense-support";
  }

  if (
    workflow.includes("invoice") ||
    target.includes("invoice") ||
    type.includes("invoice")
  ) {
    return "vendor-invoices";
  }

  if (
    workflow.includes("contract") ||
    workflow.includes("commercial") ||
    target.includes("revenue") ||
    target.includes("contract") ||
    type.includes("contract") ||
    type.includes("prize")
  ) {
    return "commercial-docs";
  }

  return "expense-support";
}
