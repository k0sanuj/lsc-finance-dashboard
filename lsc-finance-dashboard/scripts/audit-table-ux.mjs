#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(rootDir, "apps", "web", "app");
const strict = process.argv.includes("--strict");

const rules = [
  {
    id: "status-control-column",
    label: "Move status controls into the status column",
    pattern: /<th>\s*(Update status|Change status|Lifecycle)\s*<\/th>/i
  },
  {
    id: "document-control-column",
    label: "Move upload controls into the documents column",
    pattern: /<th>\s*(Add document|Upload document)\s*<\/th>/i
  },
  {
    id: "generic-actions-column",
    label: "Replace generic actions columns with contextual inline controls",
    pattern: /<th>\s*Actions?\s*<\/th>/i
  },
  {
    id: "status-note-field",
    label: "Avoid mandatory note boxes beside status changes",
    pattern: /name=["']statusNote["']/i
  },
  {
    id: "raw-file-input",
    label: "Hide raw file inputs behind a single attach control",
    pattern: /<input[^>]+type=["']file["'][^>]*>/i
  }
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

function lineFor(content, index) {
  return content.slice(0, index).split("\n").length;
}

const findings = [];

for (const file of walk(appDir)) {
  const content = fs.readFileSync(file, "utf8");
  for (const rule of rules) {
    const match = rule.pattern.exec(content);
    if (!match) continue;
    findings.push({
      ruleId: rule.id,
      label: rule.label,
      file: path.relative(rootDir, file),
      line: lineFor(content, match.index)
    });
  }
}

if (findings.length === 0) {
  console.log("Table UX audit passed: no known table action anti-patterns found.");
  process.exit(0);
}

console.log(`Table UX audit found ${findings.length} advisory finding${findings.length === 1 ? "" : "s"}:`);
for (const finding of findings) {
  console.log(`- ${finding.file}:${finding.line} [${finding.ruleId}] ${finding.label}`);
}

if (strict) {
  process.exit(1);
}
