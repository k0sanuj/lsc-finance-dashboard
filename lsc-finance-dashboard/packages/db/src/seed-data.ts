export const dashboardOverview = [
  { label: "Total Revenue", value: "$0", scope: "LSC Consolidated" },
  { label: "Total Cost", value: "$0", scope: "LSC Consolidated" },
  { label: "Margin", value: "$0", scope: "LSC Consolidated" },
  { label: "Cash", value: "$0", scope: "LSC Consolidated" },
  { label: "Receivables", value: "$0", scope: "LSC Consolidated" },
  { label: "Upcoming Payments", value: "$0", scope: "LSC Consolidated" },
  { label: "MRR", value: "$0", scope: "FSP Placeholder" },
  { label: "Sponsor Count", value: "0", scope: "TBR" }
] as const;

export const monthlyCashFlow = [
  { month: "Jan", cashIn: "$0", cashOut: "$0", net: "$0" },
  { month: "Feb", cashIn: "$0", cashOut: "$0", net: "$0" },
  { month: "Mar", cashIn: "$0", cashOut: "$0", net: "$0" }
] as const;

export const upcomingPayments = [
  {
    vendor: "E1 Organizer",
    race: "Jeddah",
    category: "Licensing Fee",
    dueDate: "TBD",
    amount: "$0",
    status: "planned"
  },
  {
    vendor: "Travel Vendor",
    race: "Doha",
    category: "Travel",
    dueDate: "TBD",
    amount: "$0",
    status: "planned"
  }
] as const;

export const sponsorBreakdown = [
  { name: "Sponsor Placeholder A", contractValue: "$0", recognizedRevenue: "$0", cashCollected: "$0" },
  { name: "Sponsor Placeholder B", contractValue: "$0", recognizedRevenue: "$0", cashCollected: "$0" }
] as const;

export const tbrRaceCosts = [
  { race: "Jeddah", eventInvoices: "$0", reimbursements: "$0", total: "$0" },
  { race: "Doha", eventInvoices: "$0", reimbursements: "$0", total: "$0" }
] as const;

export const costCategories = [
  { name: "Licensing Fee", amount: "$0", description: "Organizer-linked direct event cost." },
  { name: "Catering", amount: "$0", description: "Race and hospitality support." },
  { name: "Travel", amount: "$0", description: "Flights, visas, and local movement." },
  { name: "Equipment", amount: "$0", description: "Team gear and race support purchases." }
] as const;

export const commercialGoals = [
  { month: "Jan", target: "$0", actual: "$0", gap: "$0" },
  { month: "Feb", target: "$0", actual: "$0", gap: "$0" },
  { month: "Mar", target: "$0", actual: "$0", gap: "$0" }
] as const;

export const partnerPerformance = [
  { owner: "Partner One", targetRevenue: "$0", closedRevenue: "$0", status: "awaiting pipeline" },
  { owner: "Partner Two", targetRevenue: "$0", closedRevenue: "$0", status: "awaiting pipeline" }
] as const;

export const aiInsights = [
  {
    type: "Monthly Summary",
    title: "Revenue remains placeholder-backed",
    summary: "No live revenue imports are connected yet. Once source maps are wired, this panel should summarize monthly movement."
  },
  {
    type: "Risk Flag",
    title: "Receivables logic still needs source data",
    summary: "Receivables and due payments should remain derived from canonical invoice and payment records, not manual dashboard fields."
  },
  {
    type: "Action",
    title: "Connect TBR sponsor and race inputs first",
    summary: "That unlocks the most important Overview, TBR, Costs, and Commercial Goals sections with the least model ambiguity."
  }
] as const;

export const documentAnalysisQueue = [
  {
    id: "seed-contract-review",
    documentName: "Classic Car Club Manhattan Contract.pdf",
    documentType: "Sponsorship Contract",
    status: "awaiting review",
    confidence: "0.91",
    proposedTarget: "contracts -> revenue_records"
  },
  {
    id: "seed-prize-review",
    documentName: "E1 Prize Confirmation S2.pdf",
    documentType: "Prize Statement",
    status: "approved for posting",
    confidence: "0.88",
    proposedTarget: "revenue_records"
  }
] as const;

export const documentExtractedFields = [
  {
    field: "Counterparty",
    proposedValue: "Classic Car Club Manhattan",
    confidence: "0.98",
    approval: "approved"
  },
  {
    field: "Contract Value",
    proposedValue: "$100,000",
    confidence: "0.95",
    approval: "approved"
  },
  {
    field: "Recognition Trigger",
    proposedValue: "Season 1 Sponsorship",
    confidence: "0.76",
    approval: "needs review"
  }
] as const;

export const documentPostingEvents = [
  {
    target: "contracts / revenue_records",
    status: "posted",
    summary: "Season 1 sponsorship approved and posted into canonical revenue records."
  },
  {
    target: "revenue_records",
    status: "pending_review",
    summary: "Season 2 prize statement is awaiting final approval before posting."
  }
] as const;
