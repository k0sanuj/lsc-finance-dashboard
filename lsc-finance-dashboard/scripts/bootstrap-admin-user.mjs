import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomBytes, scryptSync } from "node:crypto";
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

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));

  const connectionString = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  const email = process.env.AUTH_BOOTSTRAP_EMAIL;
  const fullName = process.env.AUTH_BOOTSTRAP_NAME;
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  const role = process.env.AUTH_BOOTSTRAP_ROLE ?? "super_admin";

  if (!connectionString) {
    throw new Error("DATABASE_URL_ADMIN or DATABASE_URL must be set before bootstrapping an admin user.");
  }

  if (!email || !fullName || !password) {
    throw new Error(
      "AUTH_BOOTSTRAP_EMAIL, AUTH_BOOTSTRAP_NAME, and AUTH_BOOTSTRAP_PASSWORD must be set in .env.local before bootstrapping."
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");

    const passwordHash = hashPassword(password);
    const normalizedEmail = normalizeEmail(email);
    const { rows } = await client.query(
      `insert into app_users (full_name, email, normalized_email, role, password_hash)
       values ($1, $2, $3, $4::app_user_role, $5)
       on conflict (normalized_email) do update
         set full_name = excluded.full_name,
             email = excluded.email,
             role = excluded.role,
             password_hash = excluded.password_hash,
             is_active = true,
             updated_at = now()
       returning id`,
      [fullName, email, normalizedEmail, role, passwordHash]
    );

    const company = await client.query(`select id from companies where code = 'TBR'::company_code`);
    const companyId = company.rows[0]?.id ?? null;

    if (companyId) {
      await client.query(
        `insert into app_user_company_access (app_user_id, company_id, access_role, is_primary)
         values ($1, $2, $3::app_user_role, true)
         on conflict (app_user_id, company_id) do update
           set access_role = excluded.access_role,
               is_primary = true`,
        [rows[0].id, companyId, role]
      );
    }

    await client.query(
      `insert into auth_access_events (app_user_id, event_type, event_status, metadata)
       values ($1, 'bootstrap_admin', 'success', $2::jsonb)`,
      [rows[0].id, JSON.stringify({ email: normalizedEmail, role })]
    );

    await client.query("commit");
    console.log(`Bootstrapped admin user ${email}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
