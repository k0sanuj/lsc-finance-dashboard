#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(rootDir, "apps", "web", "app");

const requiredFiles = [
  "components/ai-intake-panel.tsx",
  "components/ai-extract-panel.tsx",
  "components/bill-uploader.tsx",
  "components/document-analyzer-panel.tsx",
  "components/race-budget-rule-builder.tsx",
  "fsp/sports/[sport]/page.tsx"
];

function read(relativePath) {
  return fs.readFileSync(path.join(appDir, relativePath), "utf8");
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const findings = [];

for (const file of walk(appDir)) {
  const content = fs.readFileSync(file, "utf8");
  const rawFileInput = /<input[^>]+type=["']file["'][^>]*>/i.exec(content);
  if (rawFileInput) {
    findings.push({
      file: path.relative(rootDir, file),
      issue: "raw file input",
      detail: "Use FileAttachField so users see the selected document name."
    });
  }
}

const sharedControl = read("components/inline-table-controls.tsx");
for (const marker of ["selectedFileNames", "selected-file-list", "aria-live=\"polite\""]) {
  if (!sharedControl.includes(marker)) {
    findings.push({
      file: "apps/web/app/components/inline-table-controls.tsx",
      issue: "missing selected-file feedback",
      detail: `Expected marker ${marker}.`
    });
  }
}

for (const relativePath of requiredFiles) {
  const content = read(relativePath);
  if (!content.includes("FileAttachField")) {
    findings.push({
      file: `apps/web/app/${relativePath}`,
      issue: "upload surface bypasses shared attach control",
      detail: "Import and render FileAttachField for consistent selected-file feedback."
    });
  }
}

const aiIntakePanel = read("components/ai-intake-panel.tsx");
if (!aiIntakePanel.includes("SubmitButton") || !aiIntakePanel.includes("Extracting...")) {
  findings.push({
    file: "apps/web/app/components/ai-intake-panel.tsx",
    issue: "AI intake submit lacks pending feedback",
    detail: "Use SubmitButton with an extraction pending label."
  });
}

if (findings.length > 0) {
  console.log(`AI upload UX audit found ${findings.length} finding${findings.length === 1 ? "" : "s"}:`);
  for (const finding of findings) {
    console.log(`- ${finding.file}: [${finding.issue}] ${finding.detail}`);
  }
  process.exit(1);
}

console.log("AI upload UX audit passed: upload surfaces show selected documents and use shared controls.");
