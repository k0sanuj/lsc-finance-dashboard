import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

async function loadEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separator = line.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function requiredEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const vercelBinary = path.join(projectRoot, "node_modules", ".bin", "vercel");
  const envEntries = [
    ["DATABASE_URL", requiredEnv("DATABASE_URL")],
    ["LSC_DATA_BACKEND", requiredEnv("LSC_DATA_BACKEND")],
    ["LSC_APP_READ_PASSWORD", requiredEnv("LSC_APP_READ_PASSWORD")],
    ["LSC_IMPORT_RW_PASSWORD", requiredEnv("LSC_IMPORT_RW_PASSWORD")],
    ["GEMINI_API_KEY", requiredEnv("GEMINI_API_KEY")],
    ["GEMINI_MODEL", process.env.GEMINI_MODEL || "gemini-2.5-flash"],
    ["AUTH_SESSION_SECRET", requiredEnv("AUTH_SESSION_SECRET")],
  ];

  const buildArgs = ["build", "--target=preview"];
  const buildResult = spawnSync(vercelBinary, buildArgs, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (typeof buildResult.status === "number" && buildResult.status !== 0) {
    process.exitCode = buildResult.status;
    return;
  }

  if (buildResult.error) {
    throw buildResult.error;
  }

  const args = ["deploy", "--prebuilt", "--target=preview", "--yes", "--logs"];

  for (const [key, value] of envEntries) {
    args.push("-e", `${key}=${value}`);
  }

  const result = spawnSync(vercelBinary, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
    return;
  }

  if (result.error) {
    throw result.error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
