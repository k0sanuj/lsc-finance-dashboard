export function formatWorkflowContextLabel(workflowContext: string | null | undefined) {
  const value = String(workflowContext ?? "").trim();

  if (!value) {
    return "General workflow";
  }

  if (value.startsWith("tbr-race:")) {
    return value.includes(":expense-bills") ? "TBR race bill intake" : "TBR race workflow";
  }

  if (value === "invoice-hub") {
    return "Invoice hub";
  }

  if (value === "costs") {
    return "Costs workspace";
  }

  if (value === "documents") {
    return "Documents workspace";
  }

  return value
    .replace(/[-_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatOriginSourceLabel(originSource: string | null | undefined) {
  const value = String(originSource ?? "").trim();

  if (!value) {
    return "Unknown";
  }

  if (value === "receipt_image") {
    return "Receipt image";
  }

  if (value === "portal_upload") {
    return "Portal upload";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatTargetLabel(target: string | null | undefined) {
  const value = String(target ?? "").trim();

  if (!value) {
    return "Pending review";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
