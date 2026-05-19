#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(rootDir, "apps", "web", "app");
const scanRoots = [
  appDir,
  path.join(rootDir, "agents"),
  path.join(rootDir, "docs"),
  path.join(rootDir, "scripts"),
];

const forbiddenPatterns = [
  { id: "righthealth-name", pattern: /\bRightHealth\b/i, detail: "Do not copy RightHealth branding into LSC." },
  { id: "biohealth-name", pattern: /\bBioHealth\b/i, detail: "Do not copy RightHealth center names into LSC." },
  { id: "class-medical-name", pattern: /\bClass Medical\b/i, detail: "Do not copy RightHealth center names into LSC." },
  { id: "cmc-name", pattern: /\bCMC\b/, detail: "Do not copy RightHealth center abbreviations into LSC." },
  { id: "healthcare-patients", pattern: /\bPatients\b|\bpatients\b/, detail: "Do not copy healthcare domain labels into LSC." },
  { id: "healthcare-dvr", pattern: /\bDVR\b/, detail: "Do not copy healthcare module labels into LSC." },
  { id: "healthcare-outsource", pattern: /\bOutsource\b/, detail: "Do not copy healthcare module labels into LSC." },
  { id: "healthcare-pharmacy", pattern: /\bPharmacy\b/, detail: "Do not copy healthcare module labels into LSC." },
  { id: "righthealth-green", pattern: /#1C5E54|#3CA08F/i, detail: "Use LSC blue tokens, not RightHealth green." },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile()) return [];
    return /\.(tsx|ts|css|mjs|md)$/.test(entry.name) ? [fullPath] : [];
  });
}

function lineFor(content, index) {
  return content.slice(0, index).split("\n").length;
}

const findings = [];

for (const file of walk(appDir)) {
  const relative = path.relative(rootDir, file);
  const content = fs.readFileSync(file, "utf8");
  for (const rule of forbiddenPatterns) {
    const match = rule.pattern.exec(content);
    if (!match) continue;
    findings.push({
      file: relative,
      line: lineFor(content, match.index),
      ruleId: rule.id,
      detail: rule.detail,
    });
  }
}

const xteAllowlist = [
  "apps/web/app/lib/entities.ts",
  "packages/db/src/queries/finance.ts",
  "packages/db/src/queries/xtz-invoices.ts",
  "scripts/audit-lsc-blue-ui.mjs",
  "scripts/seed-employees-sports.mjs",
];

for (const root of scanRoots) {
  for (const file of walk(root)) {
    const relative = path.relative(rootDir, file);
    if (xteAllowlist.includes(relative)) continue;
    const content = fs.readFileSync(file, "utf8");
    const index = content.indexOf("XTE");
    if (index === -1) continue;
    findings.push({
      file: relative,
      line: lineFor(content, index),
      ruleId: "visible-xte",
      detail: "XTE is allowed only in compatibility mappers or legacy seed/audit internals.",
    });
  }
}

const entities = fs.readFileSync(path.join(appDir, "lib", "entities.ts"), "utf8");
for (const marker of [
  'VISIBLE_ENTITY_ORDER = ["LSC", "TBR", "FSP", "XTZ"]',
  'label: "LSC / XTZ Esports Tech Ltd (Dubai)"',
  'label: "Team Blue Rising"',
  'label: "Future of Sports"',
  'label: "XTZ India"',
  'if (upper === "XTE") return "LSC"',
]) {
  if (!entities.includes(marker)) {
    findings.push({
      file: "apps/web/app/lib/entities.ts",
      line: 1,
      ruleId: "entity-registry",
      detail: `Expected entity registry marker: ${marker}`,
    });
  }
}

const shell = fs.readFileSync(path.join(appDir, "session-shell.tsx"), "utf8");
for (const marker of ["rail-nav", "Overview", "LSC", "TBR", "FSP", "XTZ", "Costs", "Payments", "Documents", "AI", "System"]) {
  if (!shell.includes(marker)) {
    findings.push({
      file: "apps/web/app/session-shell.tsx",
      line: 1,
      ruleId: "compact-rail",
      detail: `Expected compact rail marker: ${marker}`,
    });
  }
}

if (shell.includes("XTE")) {
  findings.push({
    file: "apps/web/app/session-shell.tsx",
    line: lineFor(shell, shell.indexOf("XTE")),
    ruleId: "visible-xte",
    detail: "XTE must stay hidden from visible navigation and selectors.",
  });
}

const chartComponent = fs.readFileSync(path.join(appDir, "components", "lsc-dashboard-charts.tsx"), "utf8");
if (!chartComponent.includes("from \"recharts\"")) {
  findings.push({
    file: "apps/web/app/components/lsc-dashboard-charts.tsx",
    line: 1,
    ruleId: "recharts-layer",
    detail: "Dashboard redesign must render through the shared Recharts layer.",
  });
}

const priorityDashboardFiles = [
  "page.tsx",
  path.join("tbr", "operating-expenses", "page.tsx"),
  path.join("tbr", "e1-accounting", "page.tsx"),
  path.join("tbr", "overall-pnl", "page.tsx"),
  path.join("fsp", "sports", "page.tsx"),
  path.join("payroll-invoices", "page.tsx"),
];

for (const relativeFile of priorityDashboardFiles) {
  const absoluteFile = path.join(appDir, relativeFile);
  const content = fs.readFileSync(absoluteFile, "utf8");
  for (const legacy of ["HorizontalMetricBars", "CashTrendChart"]) {
    const index = content.indexOf(legacy);
    if (index === -1) continue;
    findings.push({
      file: path.relative(rootDir, absoluteFile),
      line: lineFor(content, index),
      ruleId: "legacy-dashboard-chart",
      detail: `Priority dashboard should use shared Recharts primitives instead of ${legacy}.`,
    });
  }
}

if (findings.length > 0) {
  console.log(`LSC Blue UI audit found ${findings.length} finding${findings.length === 1 ? "" : "s"}:`);
  for (const finding of findings) {
    console.log(`- ${finding.file}:${finding.line} [${finding.ruleId}] ${finding.detail}`);
  }
  process.exit(1);
}

console.log("LSC Blue UI audit passed: no RightHealth spillover and compact LSC rail markers are present.");
