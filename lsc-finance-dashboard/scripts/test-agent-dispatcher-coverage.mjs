#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const graphPath = path.join(ROOT, "agents", "agent-graph.ts");
const dispatcherPath = path.join(ROOT, "skills", "dispatcher.ts");

const graph = fs.readFileSync(graphPath, "utf8");
const dispatcher = fs.readFileSync(dispatcherPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`✓ ${message}\n`);
}

const enumBlock = graph.match(/export enum AgentId \{([\s\S]*?)\n\}/)?.[1] ?? "";
const enumMap = new Map();
for (const match of enumBlock.matchAll(/(\w+)\s*=\s*"([^"]+)"/g)) {
  enumMap.set(match[1], match[2]);
}

const registryBlock = dispatcher.match(/const SKILL_REGISTRY:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? "";
const registered = new Set([...registryBlock.matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]));

const skillsStart = graph.indexOf("export const AGENT_SKILLS");
const skillsBlock = graph.slice(skillsStart, graph.indexOf("};", skillsStart) + 2);
const missing = [];
for (const match of skillsBlock.matchAll(/\[AgentId\.(\w+)\]\s*:\s*\[([\s\S]*?)\]/g)) {
  const agentId = enumMap.get(match[1]) ?? match[1];
  if (agentId === "orchestrator") continue;
  const skills = [...match[2].matchAll(/"([^"]+)"/g)].map((skillMatch) => skillMatch[1]);
  for (const skill of skills) {
    if (["ontology-query", "cascade-update", "audit-log"].includes(skill)) continue;
    const key = `${agentId}:${skill}`;
    if (!registered.has(key)) missing.push(key);
  }
}

assert(missing.length === 0, `dispatcher handlers registered for every declared skill (${missing.join(", ") || "none missing"})`);

const mutatingSkills = [
  "process-message",
  "send-message",
  "send-notification",
  "upload-document",
  "analyze-document",
  "create-invoice-intake",
  "approve-invoice-intake",
  "post-invoice",
  "manage-budget-rules",
  "create-expense-submission",
  "approve-expense-submission",
  "add-vendor",
  "update-vendor",
  "dismiss-alert",
  "employee-add",
  "employee-update",
  "salary-update",
  "generate-payroll-invoice",
  "share-grant-process",
  "generate-payouts",
  "process-payout",
  "confirm-payout",
];

for (const skill of mutatingSkills) {
  const index = dispatcher.indexOf(`:${skill}"`);
  assert(index >= 0, `${skill}: registered`);
  const localBlock = dispatcher.slice(Math.max(0, index - 600), index + 1800);
  assert(localBlock.includes("runApprovedMutation") || localBlock.includes("requireApprovedMutation"), `${skill}: approval/idempotency gate present`);
}

assert(dispatcher.includes("cascadeUpdate({"), "mutating dispatcher uses cascadeUpdate");
