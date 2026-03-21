#!/usr/bin/env node

/**
 * LSC Finance Dashboard CLI
 *
 * Usage:
 *   node scripts/cli.mjs test         — run all integration tests
 *   node scripts/cli.mjs test:gemini  — test Gemini API key
 *   node scripts/cli.mjs test:s3      — test S3 upload/download
 *   node scripts/cli.mjs test:db      — test database connection
 *   node scripts/cli.mjs upload <file> — upload and analyze a document
 *   node scripts/cli.mjs env          — show env var status
 *   node scripts/cli.mjs deploy       — deploy to Vercel production
 */

import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

// Load env from apps/web/.env.local
const envPath = join(import.meta.dirname, "..", "apps", "web", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function ok(msg) { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`${RED}✗${RESET} ${msg}`); }
function info(msg) { console.log(`${CYAN}→${RESET} ${msg}`); }
function heading(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }

// ─── Test: Gemini API ──────────────────────────────────────
async function testGemini() {
  heading("Testing Gemini API");
  const key = (process.env.GEMINI_API_KEY ?? "").trim().replace(/[\r\n]/g, "");

  if (!key) {
    fail("GEMINI_API_KEY is not set");
    return false;
  }

  info(`Key: ${key.slice(0, 10)}...${key.slice(-4)} (${key.length} chars)`);

  // Check for invalid chars
  const badChars = key.split("").filter(c => c.charCodeAt(0) > 127 || c.charCodeAt(0) < 32);
  if (badChars.length > 0) {
    fail(`Key contains ${badChars.length} invalid characters: ${badChars.map(c => `0x${c.charCodeAt(0).toString(16)}`).join(", ")}`);
    return false;
  }
  ok("Key format is valid");

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  info(`Model: ${model}`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with exactly: LSC_TEST_OK" }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 20 }
      })
    });

    if (res.status === 200) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      ok(`API call succeeded (${res.status}): ${text.trim()}`);
      return true;
    } else {
      const err = await res.text();
      fail(`API call failed (${res.status}): ${err.slice(0, 200)}`);
      return false;
    }
  } catch (e) {
    fail(`Request error: ${e.message}`);
    return false;
  }
}

// ─── Test: S3 ──────────────────────────────────────────────
async function testS3() {
  heading("Testing S3 Storage");

  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKey || !secretKey) {
    fail("S3 env vars missing: S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
    return false;
  }

  info(`Bucket: ${bucket} (${region})`);

  try {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: region ?? "ap-southeast-1",
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }
    });

    const testKey = `_cli-test/${Date.now()}.txt`;

    // Upload
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: testKey, Body: "CLI test", ContentType: "text/plain"
    }));
    ok("Upload succeeded");

    // Download
    const getRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
    const body = await getRes.Body.transformToString();
    if (body === "CLI test") {
      ok("Download verified");
    } else {
      fail(`Download content mismatch: ${body}`);
    }

    // Cleanup
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
    ok("Cleanup done");
    return true;
  } catch (e) {
    fail(`S3 error: ${e.message}`);
    return false;
  }
}

// ─── Test: Database ────────────────────────────────────────
async function testDb() {
  heading("Testing Database");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    fail("DATABASE_URL is not set");
    return false;
  }

  const host = dbUrl.match(/@([^/]+)/)?.[1] ?? "unknown";
  info(`Host: ${host}`);

  try {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
    const result = await pool.query("SELECT count(*)::text as n FROM companies");
    ok(`Connected — ${result.rows[0].n} companies found`);

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    info(`${tables.rows.length} tables in schema`);
    await pool.end();
    return true;
  } catch (e) {
    fail(`DB error: ${e.message}`);
    return false;
  }
}

// ─── Upload & Analyze Document ─────────────────────────────
async function uploadDocument(filePath) {
  heading("Upload & Analyze Document");

  if (!filePath || !existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
    return;
  }

  const fileName = basename(filePath);
  const buffer = readFileSync(filePath);
  info(`File: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);

  // Detect mime type
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
    jpeg: "image/jpeg", webp: "image/webp", csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  const mimeType = mimeMap[ext] ?? "application/octet-stream";
  info(`MIME: ${mimeType}`);

  const key = (process.env.GEMINI_API_KEY ?? "").trim().replace(/[\r\n]/g, "");
  if (!key) {
    fail("GEMINI_API_KEY not set");
    return;
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const prompt = [
    "You are a finance document analyzer for League Sports Co (LSC).",
    "Analyze this document and extract structured invoice/receipt data.",
    "Return JSON with: documentType, overallConfidence, proposedTarget, financeInterpretation, fields[].",
    "Each field: { key, label, value, normalizedValue, confidence, canonicalTargetTable, canonicalTargetColumn }.",
    "Priority fields: vendor_name, invoice_number, issue_date, due_date, total_amount, currency_code, payment_status, paid_by, category.",
    "If someone already paid (receipt), set documentType to 'Reimbursement Report' and extract paid_by.",
    "If unpaid vendor bill, set documentType to 'Vendor Invoice'.",
    `Document: ${fileName}`,
  ].join("\n");

  const parts = [{ text: prompt }];
  if (mimeType.startsWith("text/")) {
    parts.push({ text: `Document content:\n${buffer.toString("utf8").slice(0, 12000)}` });
  } else {
    parts.push({ inline_data: { mime_type: mimeType, data: buffer.toString("base64") } });
  }

  info("Calling Gemini...");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1400,
          responseMimeType: "application/json"
        }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      fail(`Gemini API error (${res.status}): ${err.slice(0, 300)}`);
      return;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    try {
      const parsed = JSON.parse(text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, ""));
      ok(`Document type: ${parsed.documentType}`);
      ok(`Confidence: ${(parsed.overallConfidence * 100).toFixed(0)}%`);
      info(`Interpretation: ${parsed.financeInterpretation}`);

      if (parsed.fields?.length > 0) {
        heading("Extracted Fields");
        console.log("");
        const maxLabel = Math.max(...parsed.fields.map(f => f.label.length), 5);
        for (const field of parsed.fields) {
          const conf = `${(field.confidence * 100).toFixed(0)}%`;
          console.log(`  ${field.label.padEnd(maxLabel + 2)} ${field.value.padEnd(30)} ${YELLOW}${conf}${RESET}`);
        }
      }
    } catch {
      info("Raw response:");
      console.log(text.slice(0, 500));
    }
  } catch (e) {
    fail(`Error: ${e.message}`);
  }
}

// ─── Show Env Status ───────────────────────────────────────
function showEnv() {
  heading("Environment Status");

  const vars = [
    ["DATABASE_URL", !!process.env.DATABASE_URL],
    ["LSC_DATA_BACKEND", process.env.LSC_DATA_BACKEND ?? "not set"],
    ["AUTH_SESSION_SECRET", !!process.env.AUTH_SESSION_SECRET],
    ["GEMINI_API_KEY", !!process.env.GEMINI_API_KEY],
    ["DOCUMENT_STORAGE_BACKEND", process.env.DOCUMENT_STORAGE_BACKEND ?? "inline"],
    ["AWS_REGION", process.env.AWS_REGION ?? "not set"],
    ["AWS_ACCESS_KEY_ID", !!process.env.AWS_ACCESS_KEY_ID],
    ["AWS_SECRET_ACCESS_KEY", !!process.env.AWS_SECRET_ACCESS_KEY],
    ["S3_BUCKET", process.env.S3_BUCKET ?? "not set"],
  ];

  for (const [name, val] of vars) {
    if (val === true) ok(`${name}: configured`);
    else if (val === false) fail(`${name}: missing`);
    else info(`${name}: ${val}`);
  }
}

// ─── Deploy ────────────────────────────────────────────────
function deploy() {
  heading("Deploying to Vercel Production");
  try {
    execSync("npx vercel --prod --scope anujsingh012001-gmailcoms-projects --yes", {
      stdio: "inherit",
      cwd: join(import.meta.dirname, "..")
    });
  } catch {
    fail("Deploy failed");
  }
}

// ─── Main ──────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "test":
    await testGemini();
    await testS3();
    await testDb();
    break;
  case "test:gemini":
    await testGemini();
    break;
  case "test:s3":
    await testS3();
    break;
  case "test:db":
    await testDb();
    break;
  case "upload":
    await uploadDocument(args[0]);
    break;
  case "env":
    showEnv();
    break;
  case "deploy":
    deploy();
    break;
  default:
    console.log(`
${BOLD}LSC Finance Dashboard CLI${RESET}

${CYAN}Commands:${RESET}
  test            Run all integration tests (Gemini, S3, DB)
  test:gemini     Test Gemini API key
  test:s3         Test S3 upload/download
  test:db         Test database connection
  upload <file>   Upload and analyze a document via Gemini
  env             Show environment variable status
  deploy          Deploy to Vercel production
    `);
}
