export type AgentStatus = "active" | "idle" | "blocked";
export type AgentTier = "core" | "specialist" | "subagent";

export type AgentNode = {
  id: string;
  name: string;
  role: string;
  tier: AgentTier;
  parentId?: string;
  status: AgentStatus;
  x: number;
  y: number;
};

export type AgentEdge = {
  id: string;
  from: string;
  to: string;
  type: "routes_to" | "depends_on" | "reports_to" | "validates";
};

export const agentNodes: AgentNode[] = [
  {
    id: "finance-overlord",
    name: "Finance Overlord",
    role: "Coordinator",
    tier: "core",
    status: "active",
    x: 420,
    y: 260
  },
  {
    id: "finance-architect",
    name: "Finance Architect",
    role: "Metric Logic",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "active",
    x: 170,
    y: 120
  },
  {
    id: "ontology-architect",
    name: "Ontology Architect",
    role: "Canonical Model",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "active",
    x: 290,
    y: 80
  },
  {
    id: "schema-engineer",
    name: "Schema Engineer",
    role: "Neon Schema",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "active",
    x: 550,
    y: 80
  },
  {
    id: "import-engineer",
    name: "Import Engineer",
    role: "Sheets + Files",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "idle",
    x: 680,
    y: 130
  },
  {
    id: "app-engineer",
    name: "App Engineer",
    role: "APIs + Services",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "active",
    x: 690,
    y: 380
  },
  {
    id: "ui-engineer",
    name: "UI Engineer",
    role: "Dashboard Surfaces",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "active",
    x: 540,
    y: 445
  },
  {
    id: "qa-agent",
    name: "QA Debug Agent",
    role: "Validation",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "idle",
    x: 300,
    y: 445
  },
  {
    id: "ai-analysis-agent",
    name: "AI Analysis Agent",
    role: "Narrative Layer",
    tier: "specialist",
    parentId: "finance-overlord",
    status: "idle",
    x: 160,
    y: 360
  },
  {
    id: "view-builder",
    name: "View Builder",
    role: "Analytics Views",
    tier: "subagent",
    parentId: "schema-engineer",
    status: "active",
    x: 760,
    y: 40
  },
  {
    id: "lineage-mapper",
    name: "Lineage Mapper",
    role: "Raw To Canonical",
    tier: "subagent",
    parentId: "import-engineer",
    status: "idle",
    x: 860,
    y: 180
  }
] as const;

export const agentEdges: AgentEdge[] = [
  { id: "e1", from: "finance-overlord", to: "finance-architect", type: "routes_to" },
  { id: "e2", from: "finance-overlord", to: "ontology-architect", type: "routes_to" },
  { id: "e3", from: "finance-overlord", to: "schema-engineer", type: "routes_to" },
  { id: "e4", from: "finance-overlord", to: "import-engineer", type: "routes_to" },
  { id: "e5", from: "finance-overlord", to: "app-engineer", type: "routes_to" },
  { id: "e6", from: "finance-overlord", to: "ui-engineer", type: "routes_to" },
  { id: "e7", from: "finance-overlord", to: "qa-agent", type: "routes_to" },
  { id: "e8", from: "finance-overlord", to: "ai-analysis-agent", type: "routes_to" },
  { id: "e9", from: "schema-engineer", to: "view-builder", type: "depends_on" },
  { id: "e10", from: "import-engineer", to: "lineage-mapper", type: "depends_on" },
  { id: "e11", from: "qa-agent", to: "finance-overlord", type: "reports_to" },
  { id: "e12", from: "ai-analysis-agent", to: "finance-overlord", type: "reports_to" },
  { id: "e13", from: "ontology-architect", to: "schema-engineer", type: "validates" },
  { id: "e14", from: "schema-engineer", to: "app-engineer", type: "depends_on" },
  { id: "e15", from: "app-engineer", to: "ui-engineer", type: "depends_on" }
] as const;
