import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

// Fix @swc/helpers subpath exports for Vercel nft trace.
// Vercel's nft traces package.json "exports" and expects physical dirs
// for subpaths like "./_/_interop_require_default". pnpm's CAS doesn't
// create these, so we create stub package.json files.

function fixSwcHelpers(baseNodeModules) {
  const swcDir = join(baseNodeModules, "@swc", "helpers");
  if (!existsSync(swcDir)) return false;

  const pkgPath = join(swcDir, "package.json");
  if (!existsSync(pkgPath)) return false;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const exports = pkg.exports;
  if (!exports || typeof exports !== "object") return false;

  let count = 0;
  for (const key of Object.keys(exports)) {
    // Match exports like "./_/_interop_require_default"
    if (!key.startsWith("./_/")) continue;

    // Convert "./_/_foo" to directory path "_/_foo"
    const subpath = key.slice(2); // remove "./"
    const dir = join(swcDir, subpath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      const exportEntry = exports[key];
      const mainFile =
        typeof exportEntry === "string"
          ? exportEntry
          : typeof exportEntry === "object" && exportEntry.import
            ? exportEntry.import
            : typeof exportEntry === "object" && exportEntry.default
              ? exportEntry.default
              : "./index.js";
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ name: key.slice(2), main: mainFile })
      );
      count++;
    }
  }

  if (count > 0) {
    console.log(`postinstall: created ${count} @swc/helpers subpath dirs in ${swcDir}`);
  }
  return count > 0;
}

// Try all possible node_modules locations
const cwd = process.cwd();
const locations = [
  join(cwd, "node_modules"),
  "/node_modules",
  "/vercel/path0/node_modules",
  resolve(cwd, "..", "node_modules"),
];

let fixed = false;

// Also search filesystem for @swc/helpers
try {
  const { execSync } = await import("child_process");
  const found = execSync("find / -path '*/@swc/helpers/package.json' -maxdepth 8 2>/dev/null | head -10 || echo 'NOT FOUND'", { encoding: "utf8" }).trim();
  console.log("postinstall: find result:", found);

  if (found && found !== "NOT FOUND") {
    for (const pkgPath of found.split("\n")) {
      if (!pkgPath.endsWith("/package.json")) continue;
      const swcDir = pkgPath.replace("/package.json", "");
      const parentNodeModules = swcDir.replace("/@swc/helpers", "");
      console.log("postinstall: trying fix at", parentNodeModules);
      if (fixSwcHelpers(parentNodeModules)) fixed = true;
    }
  }
} catch (e) {
  console.log("postinstall: find error:", e.message);
}
for (const loc of locations) {
  if (fixSwcHelpers(loc)) fixed = true;
}

if (!fixed) {
  console.log("postinstall: @swc/helpers not found or no subpath exports to fix");
}
