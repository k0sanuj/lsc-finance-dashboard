import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

// Fix @swc/helpers subpath exports for Vercel nft trace
// Creates _/<helper>/package.json for each helper module
const swcDir = join("node_modules", "@swc", "helpers");
if (existsSync(swcDir)) {
  const targetDir = join(swcDir, "_");
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  for (const entry of readdirSync(swcDir)) {
    if (!entry.startsWith("_") || entry === "_") continue;
    const dest = join(targetDir, entry);
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true });
      writeFileSync(
        join(dest, "package.json"),
        JSON.stringify({ main: `../../esm/${entry}.js` })
      );
    }
  }
  console.log("postinstall: fixed @swc/helpers subpath exports");
}
