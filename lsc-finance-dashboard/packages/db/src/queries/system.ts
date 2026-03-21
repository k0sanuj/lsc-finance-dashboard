import "server-only";

import { agentEdges, agentNodes } from "../agent-graph";
import { aiInsights } from "../seed-data";
import { queryRows } from "../query";
import { workflowBranches, workflowStages } from "../workflow-graph";
import {
  type OverviewMetric,
  formatCurrency,
  getBackend
} from "./shared";
import { getOverviewMetrics as getOverviewMetricsFromFinance } from "./finance";

export type AgentGraphNode = {
  id: string;
  name: string;
  role: string;
  tier: "core" | "specialist" | "subagent";
  parentId?: string;
  status: "active" | "idle" | "blocked";
  x: number;
  y: number;
};

export type AgentGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: "routes_to" | "depends_on" | "reports_to" | "validates";
};

export type WorkflowStageRow = {
  id: string;
  name: string;
  owner: string;
};

export type AgentNodeSource = {
  id: string;
  name: string;
  role: string;
  tier: "core" | "specialist" | "subagent";
  parent_agent_id: string | null;
  status: "active" | "idle" | "blocked";
  position_x: number;
  position_y: number;
};

export type AgentEdgeSource = {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  interaction_type: "routes_to" | "depends_on" | "reports_to" | "validates";
};

export type WorkflowStageSource = {
  id: string;
  name: string;
  owner_name: string | null;
};

type AiInsight = {
  type: string;
  title: string;
  summary: string;
};

async function generateGeminiInsights(metrics: OverviewMetric[]): Promise<AiInsight[]> {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim().replace(/[\r\n]/g, "");
  if (!apiKey) return [];

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const metricsContext = metrics.map((m) => `${m.label} (${m.scope}): ${m.value}`).join("\n");

  // Fetch additional context for richer insights
  const [seasonRows, expenseRows, payableRows] = await Promise.all([
    queryRows<{ season_year: number; race_count: string }>(
      `select re.season_year, count(*)::text as race_count
       from race_events re join companies c on c.id = re.company_id
       where c.code = 'TBR' and re.season_year is not null
       group by re.season_year order by re.season_year`
    ),
    queryRows<{ submission_status: string; cnt: string }>(
      `select submission_status, count(*)::text as cnt
       from expense_submissions group by submission_status`
    ),
    queryRows<{ total: string }>(
      `select coalesce(sum(total_amount), 0)::text as total
       from invoices
       where direction = 'payable'
         and invoice_status in ('draft', 'issued', 'partially_paid', 'overdue')`
    ),
  ]);

  const contextLines = [
    "Overview metrics:",
    metricsContext,
    "",
    "Season data:",
    seasonRows.map((r) => `Season ${r.season_year}: ${r.race_count} races`).join("\n") || "No season data",
    "",
    "Expense submission status breakdown:",
    expenseRows.map((r) => `${r.submission_status}: ${r.cnt}`).join(", ") || "No submissions",
    "",
    `Open payables total: $${Number(payableRows[0]?.total ?? 0).toLocaleString()}`,
  ];

  const prompt = [
    "You are an AI financial analyst for League Sports Co (LSC), a motorsport holding company.",
    "LSC owns TBR (Team Blue Rising), the active racing entity, and FSP (Future of Sports), a future entity.",
    "",
    "Based on the following live financial data, generate exactly 5 insights.",
    "Each insight must have a type (one of: Portfolio Summary, TBR Operating, Commercial Brief, Risk Flag, Action Item),",
    "a concise title (under 80 chars), and a 1-2 sentence summary with specific numbers.",
    "",
    "Focus on actionable intelligence a CFO would care about.",
    "Do NOT mention database connectivity, imports, or technical details.",
    "Speak about the business, not the system.",
    "",
    "Return valid JSON only — an array of objects with type, title, summary fields.",
    "",
    ...contextLines,
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1200,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) return [];

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const jsonText = payload.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text ?? "";
    if (!jsonText) return [];

    const stripped = jsonText.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(stripped);

    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          type: String(item.type ?? "Portfolio Summary"),
          title: String(item.title ?? "Insight"),
          summary: String(item.summary ?? ""),
        }));
    }

    return [];
  } catch {
    return [];
  }
}

async function getDbAiInsights(): Promise<AiInsight[]> {
  const metrics = await getOverviewMetricsFromFinance();

  // Try Gemini-powered insights first
  const geminiInsights = await generateGeminiInsights(metrics);
  if (geminiInsights.length > 0) return geminiInsights;

  // Fallback to metric-based insights if Gemini is unavailable
  const totalRevenue =
    metrics.find((item: OverviewMetric) => item.label === "Total Revenue")?.value ?? "$0";
  const totalCost = metrics.find((item: OverviewMetric) => item.label === "Total Cost")?.value ?? "$0";
  const margin = metrics.find((item: OverviewMetric) => item.label === "Margin")?.value ?? "$0";
  const upcoming =
    metrics.find((item: OverviewMetric) => item.label === "Upcoming Payments")?.value ?? "$0";
  const receivables =
    metrics.find((item: OverviewMetric) => item.label === "Receivables")?.value ?? "$0";

  return [
    {
      type: "Portfolio Summary",
      title: "LSC consolidated financial position",
      summary: `Revenue stands at ${totalRevenue} against costs of ${totalCost}, yielding a margin of ${margin}. The consolidated view reflects TBR as the primary operating entity.`
    },
    {
      type: "TBR Operating",
      title: "Cash position and payable obligations",
      summary: `Upcoming payment obligations total ${upcoming}. Outstanding receivables are ${receivables}. Monitor collection velocity against payable due dates.`
    },
    {
      type: "Risk Flag",
      title: "Review expense submission pipeline",
      summary: "Ensure all submitted expenses have budget rule coverage. Unmatched submissions create approval delays and complicate race-level P&L accuracy."
    },
    {
      type: "Commercial Brief",
      title: "Sponsor revenue recognition tracking",
      summary: "Track recognized revenue against contract values to identify sponsors with delayed recognition. Early detection prevents year-end revenue shortfalls."
    },
    {
      type: "Action Item",
      title: "Close open payables before next race",
      summary: `Review the ${upcoming} in open payables. Vendor relationships depend on timely settlement, especially for recurring race operations vendors.`
    }
  ];
}

async function getDbAgentGraph() {
  const nodes = await queryRows<{
    id: string;
    name: string;
    role: string;
    tier: "core" | "specialist" | "subagent";
    parent_agent_id: string | null;
    status: "active" | "idle" | "blocked";
    position_x: number;
    position_y: number;
  }>(
    `select id, name, role, tier, parent_agent_id, status, position_x, position_y
     from agent_nodes
     order by id`
  );

  const edges = await queryRows<{
    id: string;
    from_agent_id: string;
    to_agent_id: string;
    interaction_type: "routes_to" | "depends_on" | "reports_to" | "validates";
  }>(
    `select id, from_agent_id, to_agent_id, interaction_type
     from agent_edges
     where is_active = true
     order by id`
  );

  if (nodes.length === 0 || edges.length === 0) {
    return {
      nodes: [...agentNodes],
      edges: [...agentEdges]
    };
  }

  return {
    nodes: nodes.map<AgentGraphNode>((row: AgentNodeSource) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      tier: row.tier,
      parentId: row.parent_agent_id ?? undefined,
      status: row.status,
      x: row.position_x,
      y: row.position_y
    })),
    edges: edges.map<AgentGraphEdge>((row: AgentEdgeSource) => ({
      id: row.id,
      from: row.from_agent_id,
      to: row.to_agent_id,
      type: row.interaction_type
    }))
  };
}

async function getDbWorkflowGraph() {
  const stages = await queryRows<{
    id: string;
    name: string;
    owner_name: string | null;
  }>(
    `select wn.id, wn.name, an.name as owner_name
     from workflow_nodes wn
     left join agent_nodes an on an.id = wn.owner_agent_id
     order by wn.sequence_order`
  );

  if (stages.length === 0) {
    return {
      stages: [...workflowStages],
      branches: [...workflowBranches]
    };
  }

  return {
    stages: stages.map<WorkflowStageRow>((row: WorkflowStageSource) => ({
      id: row.id,
      name: row.name,
      owner: row.owner_name ?? "Unassigned"
    })),
    branches: workflowBranches
  };
}

export async function getAiInsights() {
  if (getBackend() === "database") {
    return getDbAiInsights();
  }

  return [...aiInsights];
}

export async function getAgentGraph() {
  if (getBackend() === "database") {
    return getDbAgentGraph();
  }

  return {
    nodes: [...agentNodes],
    edges: [...agentEdges]
  };
}

export async function getWorkflowGraph() {
  if (getBackend() === "database") {
    return getDbWorkflowGraph();
  }

  return {
    stages: [...workflowStages],
    branches: [...workflowBranches]
  };
}
