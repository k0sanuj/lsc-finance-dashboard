import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

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

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const sqlFiles = process.argv.slice(2);

  if (sqlFiles.length === 0) {
    throw new Error("Provide at least one SQL file path.");
  }

  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_ADMIN or DATABASE_URL is missing. Add one of them to .env.local before running SQL."
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const sqlFile of sqlFiles) {
      const absolutePath = path.join(projectRoot, sqlFile);
      const rawSql = await fs.readFile(absolutePath, "utf8");
      const sql = rawSql.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
        const value = process.env[key];

        if (!value) {
          throw new Error(
            `Missing environment variable ${key} required by ${sqlFile}. Set it in .env.local before running this file.`
          );
        }

        return value.replace(/'/g, "''");
      });
      process.stdout.write(`Applying ${sqlFile}\n`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
