#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import pg from "pg";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_PATHS = [
  path.join(ROOT, ".env.local"),
  path.join(ROOT, "apps", "web", ".env.local"),
];
const APP_URL = process.env.LSC_APP_URL ?? "http://localhost:3000";
const APP_ORIGIN = new URL(APP_URL).origin;
const SKIP_ROUTES = process.argv.includes("--skip-routes");

function loadEnv() {
  for (const envPath of ENV_PATHS) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function createSessionToken(payload, secret) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const binary = String.fromCharCode(...Array.from(new Uint8Array(signature)));
  return `${encodedPayload}.${toBase64Url(binary)}`;
}

async function getQaActor(pool) {
  const { rows } = await pool.query(
    `select id, email, full_name, role
     from app_users
     where is_active = true
       and role in ('super_admin', 'finance_admin')
     order by created_at asc
     limit 1`
  );
  if (!rows[0]) throw new Error("No active finance admin user found for route smoke checks.");
  return rows[0];
}

async function assertSchema(pool) {
  const { rows: enumRows } = await pool.query(
    `select 1
     from pg_enum e
     join pg_type t on t.oid = e.enumtypid
     where t.typname = 'payroll_invoice_status'
       and e.enumlabel = 'void'`
  );
  if (!enumRows[0]) throw new Error("payroll_invoice_status is missing void.");
  ok("payroll_invoice_status includes void");

  const requiredColumns = [
    ["payroll_invoices", "voided_at"],
    ["payroll_invoices", "voided_by_user_id"],
    ["payroll_invoices", "void_reason"],
    ["payroll_invoices", "cloned_from_invoice_id"],
    ["payroll_invoice_items", "ai_intake_draft_id"],
  ];
  for (const [table, column] of requiredColumns) {
    const { rows } = await pool.query(
      `select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = $1
         and column_name = $2`,
      [table, column]
    );
    if (!rows[0]) throw new Error(`${table}.${column} is missing.`);
  }
  ok("invoice lifecycle and AI-lineage columns exist");

  const { rows: uniqueRows } = await pool.query(
    `select 1
     from pg_indexes
     where schemaname = 'public'
       and tablename = 'payroll_invoices'
       and indexdef ilike '%unique%'
       and indexdef ilike '%invoice_number%'`
  );
  if (!uniqueRows[0]) throw new Error("payroll_invoices.invoice_number unique index is missing.");
  ok("invoice_number uniqueness is enforced");
}

async function assertDataRules(pool) {
  const { rows: terminatedRows } = await pool.query(
    `select pi.invoice_number, e.full_name
     from payroll_invoice_items pii
     join payroll_invoices pi on pi.id = pii.payroll_invoice_id
     join employees e on e.id = pii.employee_id
     where pi.status = 'generated'
       and pii.section = 'payroll'
       and e.status = 'terminated'
     limit 10`
  );
  if (terminatedRows.length > 0) {
    throw new Error(
      `Generated invoices still contain terminated payroll lines: ${terminatedRows
        .map((row) => `${row.invoice_number}/${row.full_name}`)
        .join(", ")}`
    );
  }
  ok("generated invoices exclude terminated employee payroll lines");

  const { rows: duplicateRows } = await pool.query(
    `select invoice_number, count(*)::int as count
     from payroll_invoices
     group by invoice_number
     having count(*) > 1
     limit 10`
  );
  if (duplicateRows.length > 0) {
    throw new Error(`Duplicate invoice numbers exist: ${duplicateRows.map((row) => row.invoice_number).join(", ")}`);
  }
  ok("existing invoice numbers are unique");
}

async function getLatestInvoice(pool) {
  const { rows } = await pool.query(
    `select id, status::text as status
     from payroll_invoices
     where status <> 'void'
     order by invoice_date desc, created_at desc
     limit 1`
  );
  return rows[0] ?? null;
}

async function assertRoutes(pool) {
  if (SKIP_ROUTES) {
    ok("route checks skipped");
    return;
  }

  const actor = await getQaActor(pool);
  const token = await createSessionToken(
    {
      sub: actor.id,
      email: actor.email,
      role: actor.role,
      name: actor.full_name,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    process.env.AUTH_SESSION_SECRET
  );
  const cookie = `lsc_finance_session=${token}`;
  const latest = await getLatestInvoice(pool);
  const routes = [
    "/payroll-invoices",
    "/payroll-invoices/generator",
  ];
  if (latest) {
    routes.push(`/payroll-invoices/${latest.id}`);
    if (latest.status === "generated") routes.push(`/payroll-invoices/${latest.id}/edit`);
  }

  for (const route of routes) {
    const response = await fetch(new URL(route, APP_URL), {
      headers: { cookie, Origin: APP_ORIGIN },
      signal: AbortSignal.timeout(120000),
    });
    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`${route} returned ${response.status}: ${text.slice(0, 160)}`);
    }
    ok(`${route} route renders`);
  }
}

async function main() {
  loadEnv();
  for (const key of ["DATABASE_URL", "AUTH_SESSION_SECRET"]) {
    if (!process.env[key]) throw new Error(`${key} is not set.`);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL,
    allowExitOnIdle: true,
    max: 1,
  });

  try {
    await assertSchema(pool);
    await assertDataRules(pool);
    await assertRoutes(pool);
    console.log("XTZ invoice workflow smoke passed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
