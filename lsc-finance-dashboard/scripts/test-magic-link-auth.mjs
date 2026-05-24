import { createHash, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;

function loadEnv() {
  for (const file of [".env.local", "apps/web/.env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

loadEnv();

if (!process.env.DATABASE_URL_ADMIN && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is required.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL });

try {
  const activeAllowed = await pool.query(
    `select count(*)::int as count from auth_allowed_identities where is_active = true`
  );
  const activeAllowedCount = activeAllowed.rows[0].count;
  assert(activeAllowedCount > 0, "No active allowed identities found.");
  assert(activeAllowedCount <= 3, "More than three active allowed identities found.");

  const outsideAllowlist = await pool.query(
    `select count(*)::int as count
     from app_users u
     left join auth_allowed_identities ai
       on ai.normalized_email = u.normalized_email and ai.is_active = true
     where u.is_active = true
       and ai.normalized_email is null`
  );
  assert(outsideAllowlist.rows[0].count === 0, "Active users exist outside the auth allowlist.");

  const client = await pool.connect();
  const email = `magic-test-${Date.now()}@example.invalid`;
  const token = randomBytes(32).toString("base64url");

  try {
    await client.query("begin");
    await client.query(
      `insert into auth_allowed_identities (normalized_email, email, full_name, role)
       values ($1, $1, 'Magic Test', 'viewer')`,
      [email]
    );
    const user = await client.query(
      `insert into app_users (full_name, email, normalized_email, role, password_hash)
       values ('Magic Test', $1, $1, 'viewer', $2)
       returning id`,
      [email, hashPassword("unused")]
    );
    await client.query(
      `insert into auth_magic_links (app_user_id, normalized_email, token_hash, expires_at)
       values ($1, $2, $3, now() + interval '15 minutes')`,
      [user.rows[0].id, email, hashToken(token)]
    );
    const openLinks = await client.query(
      `select count(*)::int as count
       from auth_magic_links
       where normalized_email = $1
         and token_hash = $2
         and consumed_at is null
         and revoked_at is null
         and expires_at > now()`,
      [email, hashToken(token)]
    );
    assert(openLinks.rows[0].count === 1, "Magic link token was not stored as an open one-time link.");
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  console.log(JSON.stringify({ ok: true, activeAllowedCount, activeUsersOutsideAllowlist: 0 }, null, 2));
} finally {
  await pool.end();
}
