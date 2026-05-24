import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;
const SCRYPT_KEY_LENGTH = 64;
const VALID_ROLES = new Set([
  "super_admin",
  "finance_admin",
  "team_member",
  "commercial_user",
  "viewer"
]);

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function parseJsonAllowlist() {
  if (!process.env.AUTH_ALLOWED_USERS_JSON) return null;
  const parsed = JSON.parse(process.env.AUTH_ALLOWED_USERS_JSON);
  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_ALLOWED_USERS_JSON must be an array.");
  }

  return parsed.map((entry) => ({
    email: String(entry.email ?? "").trim(),
    normalizedEmail: normalizeEmail(entry.email),
    fullName: String(entry.fullName ?? entry.name ?? entry.email ?? "").trim(),
    role: String(entry.role ?? "viewer")
  }));
}

function parseEmailAllowlist() {
  const raw = process.env.AUTH_ALLOWED_EMAILS;
  if (!raw) return null;

  const defaultRole = process.env.AUTH_ALLOWED_DEFAULT_ROLE ?? "viewer";
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({
      email,
      normalizedEmail: normalizeEmail(email),
      fullName: email.split("@")[0],
      role: defaultRole
    }));
}

async function loadExistingActiveUsers(pool) {
  const { rows } = await pool.query(
    `select email, normalized_email, full_name, role::text as role
     from app_users
     where is_active = true
     order by created_at`
  );

  return rows.map((row) => ({
    email: row.email,
    normalizedEmail: row.normalized_email,
    fullName: row.full_name,
    role: row.role
  }));
}

function validateAllowlist(entries) {
  const deduped = new Map();
  for (const entry of entries) {
    if (!entry.normalizedEmail || !entry.normalizedEmail.includes("@")) {
      throw new Error(`Invalid allowlist email: ${entry.email}`);
    }
    if (!VALID_ROLES.has(entry.role)) {
      throw new Error(`Invalid role for ${entry.email}: ${entry.role}`);
    }
    deduped.set(entry.normalizedEmail, {
      ...entry,
      fullName: entry.fullName || entry.email
    });
  }

  const values = [...deduped.values()];
  if (values.length === 0) throw new Error("Auth allowlist cannot be empty.");
  if (values.length > 3) throw new Error("Auth allowlist may contain at most three emails.");
  return values;
}

loadEnv();

if (!process.env.DATABASE_URL_ADMIN && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is required.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL });

try {
  const configured = parseJsonAllowlist() ?? parseEmailAllowlist();
  const source = configured ? "env" : "existing_active_app_users";
  const entries = validateAllowlist(configured ?? await loadExistingActiveUsers(pool));
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const entry of entries) {
      const passwordHash = hashPassword(`magic-link-only:${randomBytes(32).toString("hex")}`);
      const user = await client.query(
        `insert into app_users (full_name, email, normalized_email, role, password_hash, is_active, metadata)
         values ($1, $2, $3, $4, $5, true, jsonb_build_object('auth_source', 'allowlist_sync'))
         on conflict (normalized_email) do update
           set full_name = excluded.full_name,
               email = excluded.email,
               role = excluded.role,
               is_active = true,
               updated_at = now(),
               metadata = app_users.metadata || jsonb_build_object('auth_source', 'allowlist_sync')
         returning id`,
        [entry.fullName, entry.email, entry.normalizedEmail, entry.role, passwordHash]
      );

      await client.query(
        `insert into auth_allowed_identities (
           normalized_email, email, full_name, role, is_active, metadata
         )
         values ($1, $2, $3, $4, true, jsonb_build_object('source', $5::text))
         on conflict (normalized_email) do update
           set email = excluded.email,
               full_name = excluded.full_name,
               role = excluded.role,
               is_active = true,
               updated_at = now(),
               metadata = auth_allowed_identities.metadata || excluded.metadata`,
        [entry.normalizedEmail, entry.email, entry.fullName, entry.role, source]
      );

      await client.query(
        `insert into auth_access_events (app_user_id, event_type, event_status, metadata)
         values ($1, 'allowlist_sync', 'active', $2::jsonb)`,
        [user.rows[0].id, JSON.stringify({ email: entry.normalizedEmail, source })]
      );
    }

    const emails = entries.map((entry) => entry.normalizedEmail);
    await client.query(
      `update auth_allowed_identities
       set is_active = false,
           updated_at = now(),
           metadata = metadata || jsonb_build_object('deactivated_by', 'sync-auth-allowlist')
       where not (normalized_email = any($1::text[]))`,
      [emails]
    );

    await client.query(
      `update app_users
       set is_active = false,
           updated_at = now(),
           metadata = metadata || jsonb_build_object('deactivated_by', 'sync-auth-allowlist')
       where not (normalized_email = any($1::text[]))`,
      [emails]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  console.log(JSON.stringify({ ok: true, source, activeAllowedEmails: entries.length }, null, 2));
} finally {
  await pool.end();
}
