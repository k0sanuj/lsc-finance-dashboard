#!/usr/bin/env node
/**
 * Vercel post-install: copy 'next' package to apps/web/node_modules/
 * so Vercel's noop.js can find it at the rootDirectory level.
 */
import { cpSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const nextPkgPath = require.resolve("next/package.json");
const nextDir = dirname(nextPkgPath);
const targetDir = join(process.cwd(), "apps/web/node_modules/next");

if (!existsSync(targetDir)) {
  mkdirSync(join(process.cwd(), "apps/web/node_modules"), { recursive: true });
  cpSync(nextDir, targetDir, { recursive: true });
  console.log("✓ Copied next to apps/web/node_modules/next");
} else {
  console.log("✓ next already exists at apps/web/node_modules/next");
}
