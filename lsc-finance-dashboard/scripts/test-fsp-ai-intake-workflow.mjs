#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import pg from "pg";

const ROOT = path.join(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, "apps", "web", ".env.local");
const APP_URL = process.env.LSC_APP_URL ?? "http://localhost:3000";
const APP_ORIGIN = new URL(APP_URL).origin;
const SPORT_CODE = process.env.LSC_FSP_TEST_SPORT ?? "basketball";
const PAGE_PATH = `/fsp/sports/${SPORT_CODE}?tab=overview`;
const PAGE_URL = new URL(PAGE_PATH, APP_URL).toString();
const CONFIRMED =
  process.argv.includes("--confirm-post") || process.env.LSC_CONFIRM_FSP_AI_INTAKE_POST === "1";

const REQUIRED_MEDIA_KEYS = [
  "non_linear_impressions_y1",
  "non_linear_cpm_y1",
  "linear_impressions_y1",
  "linear_cpm_y1",
  "avg_viewership",
];

const REQUIRED_SPONSORSHIP_KEYS = [
  "sponsor_name",
  "segment",
  "tier",
  "contract_status",
  "year_1_value",
  "currency_code",
];

function printUsage() {
  console.log(`FSP AI intake regression posts real canonical QA records.

Usage:
  pnpm test:fsp-ai-intake -- --confirm-post

Optional env:
  LSC_APP_URL=http://localhost:3000
  LSC_FSP_TEST_SPORT=basketball
  LSC_CONFIRM_FSP_AI_INTAKE_POST=1

This script verifies:
  typed source -> AI draft -> extracted preview fields -> approve -> canonical post
  source_documents + ai_intake_posting_events + audit_log lineage
`);
}

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing env file: ${ENV_PATH}`);
  }

  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
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

function findActionId(text, name) {
  const index = text.indexOf(name);
  if (index < 0) return null;
  const snippet = text.slice(Math.max(0, index - 3000), index + name.length + 1200);
  return (
    snippet.match(/\$ACTION_ID_([a-f0-9]+)/)?.[1] ??
    snippet.match(/id\\":\\"([a-f0-9]+)\\"/)?.[1] ??
    snippet.match(/"id":"([a-f0-9]+)"/)?.[1] ??
    null
  );
}

function valueToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function expectedValue(targetKind, key, runId) {
  const media = {
    non_linear_impressions_y1: "1200000",
    non_linear_impressions_y2: "2400000",
    non_linear_impressions_y3: "3600000",
    non_linear_cpm_y1: "18",
    non_linear_cpm_y2: "20",
    non_linear_cpm_y3: "22",
    linear_impressions_y1: "500000",
    linear_impressions_y2: "750000",
    linear_impressions_y3: "1000000",
    linear_cpm_y1: "12",
    linear_cpm_y2: "14",
    linear_cpm_y3: "16",
    avg_viewership: "85000",
    assumptions: "QA controlled media kit",
  };
  const sponsorship = {
    sponsor_name: `QA Sports Partner ${runId}`,
    segment: "Title Sponsor",
    tier: "title",
    contract_status: "signed",
    year_1_value: "111111",
    year_2_value: "222222",
    year_3_value: "333333",
    currency_code: "USD",
    contract_start: "2026-06-01",
    contract_end: "2028-05-31",
    payment_schedule: "quarterly",
    deliverables_summary: "jersey branding, broadcast mentions, courtside inventory, social posts",
  };
  return (targetKind === "fsp_sport_media_kit" ? media : sponsorship)[key];
}

async function fetchText(url, options = {}, timeoutMs = 120000) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { response, text: await response.text() };
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
  if (!rows[0]) {
    throw new Error("No active super_admin or finance_admin user was found for QA session signing.");
  }
  return rows[0];
}

async function getSport(pool) {
  const { rows } = await pool.query(
    `select id, sport_code::text as sport_code
     from fsp_sports
     where sport_code::text = $1
     limit 1`,
    [SPORT_CODE]
  );
  if (!rows[0]) throw new Error(`FSP sport not found: ${SPORT_CODE}`);
  return rows[0];
}

async function getFields(pool, draftId) {
  const { rows } = await pool.query(
    `select id, field_key, preview_value, normalized_value, confidence::text
     from ai_intake_draft_fields
     where draft_id = $1::uuid
     order by sort_order`,
    [draftId]
  );
  return rows;
}

function createTypedInput(targetKind, runId) {
  if (targetKind === "fsp_sport_media_kit") {
    return `${runId} Basketball Media Kit. Document type: FSP Media Kit. non_linear_impressions_y1: 1200000. non_linear_impressions_y2: 2400000. non_linear_impressions_y3: 3600000. non_linear_cpm_y1: USD 18. non_linear_cpm_y2: USD 20. non_linear_cpm_y3: USD 22. linear_impressions_y1: 500000. linear_impressions_y2: 750000. linear_impressions_y3: 1000000. linear_cpm_y1: USD 12. linear_cpm_y2: USD 14. linear_cpm_y3: USD 16. avg_viewership: 85000. assumptions: QA controlled media kit.`;
  }

  return `${runId} Basketball Sponsorship Document. Document type: FSP Sponsorship Document. sponsor_name: QA Sports Partner ${runId}. segment: Title Sponsor. tier: title. contract_status: signed. year_1_value: USD 111111. year_2_value: USD 222222. year_3_value: USD 333333. currency_code: USD. contract_start: 2026-06-01. contract_end: 2028-05-31. payment_schedule: quarterly. deliverables_summary: jersey branding, broadcast mentions, courtside inventory, social posts.`;
}

async function createDraft({ cookie, actionId, sportId, targetKind, runId }) {
  const formData = new FormData();
  formData.set(`$ACTION_ID_${actionId}`, "");
  formData.set("companyCode", "FSP");
  formData.set("redirectPath", PAGE_PATH);
  formData.set("workflowContext", `fsp-sport:${SPORT_CODE}:cockpit`);
  formData.set("targetEntityType", "fsp_sport");
  formData.set("targetEntityId", sportId);
  formData.set("targetKind", targetKind);
  formData.set("typedInput", createTypedInput(targetKind, runId));
  formData.set(
    "documentNote",
    `${runId} controlled ${targetKind === "fsp_sport_media_kit" ? "FSP media kit" : "FSP sponsorship"} QA`
  );

  const { response, text } = await fetchText(
    PAGE_URL,
    {
      method: "POST",
      headers: {
        cookie,
        Origin: APP_ORIGIN,
        Referer: PAGE_URL,
      },
      body: formData,
      redirect: "manual",
    },
    180000
  );

  const location = response.headers.get("location");
  if (response.status !== 303 || !location) {
    throw new Error(`Create ${targetKind} failed with ${response.status}: ${text.slice(0, 200)}`);
  }

  const draftId = new URL(location, APP_URL).searchParams.get("aiDraftId");
  if (!draftId) throw new Error(`Create ${targetKind} did not return aiDraftId.`);
  return draftId;
}

async function approveDraft({ pool, cookie, draftId, targetKind, runId }) {
  const previewUrl = `${PAGE_URL}&aiDraftId=${draftId}`;
  const { response, text } = await fetchText(previewUrl, { headers: { cookie } });
  if (response.status !== 200) {
    throw new Error(`Preview route failed for ${draftId}: ${response.status}`);
  }

  const reviewActionId = findActionId(text, "reviewAiIntakeDraftAction");
  if (!reviewActionId) throw new Error(`Review action was not rendered for ${draftId}.`);

  const fields = await getFields(pool, draftId);
  if (fields.length === 0) throw new Error(`No extracted fields were saved for ${draftId}.`);

  const required = targetKind === "fsp_sport_media_kit" ? REQUIRED_MEDIA_KEYS : REQUIRED_SPONSORSHIP_KEYS;
  const found = new Set(fields.map((field) => field.field_key));
  const missing = required.filter((key) => !found.has(key));
  if (missing.length > 0) {
    throw new Error(`Draft ${draftId} is missing required extracted keys: ${missing.join(", ")}`);
  }

  const formData = new FormData();
  formData.set(`$ACTION_ID_${reviewActionId}`, "");
  formData.set("draftId", draftId);
  formData.set("redirectPath", PAGE_PATH);
  formData.set("reviewerNotes", `${runId} QA approval`);
  for (const field of fields) {
    formData.set(
      `field:${field.id}`,
      expectedValue(targetKind, field.field_key, runId) ?? valueToText(field.preview_value)
    );
  }
  formData.set("intent", "approve");

  const { response: postResponse, text: postText } = await fetchText(
    previewUrl,
    {
      method: "POST",
      headers: {
        cookie,
        Origin: APP_ORIGIN,
        Referer: previewUrl,
      },
      body: formData,
      redirect: "manual",
    },
    120000
  );
  const location = postResponse.headers.get("location");
  if (postResponse.status !== 303 || !location) {
    throw new Error(`Approve ${draftId} failed with ${postResponse.status}: ${postText.slice(0, 200)}`);
  }

  return { fieldCount: fields.length, reviewActionIdLength: reviewActionId.length, location };
}

async function verifyResults(pool, draftIds, mediaDraftId, sponsorRunId, sportId) {
  const [drafts, postingEvents, mediaRows, sponsorshipRows, sourceRows, auditRows] = await Promise.all([
    pool.query(
      `select id::text, target_kind, status, target_entity_type, target_entity_id::text,
              detected_document_type, overall_confidence::text, error_message
       from ai_intake_drafts
       where id = any($1::uuid[])
       order by created_at`,
      [draftIds]
    ),
    pool.query(
      `select draft_id::text, posting_status, canonical_target_table,
              canonical_target_id::text, posting_summary
       from ai_intake_posting_events
       where draft_id = any($1::uuid[])
       order by created_at`,
      [draftIds]
    ),
    pool.query(
      `select id::text, channel::text, impressions_y1::text, impressions_y2::text,
              impressions_y3::text, cpm_y1::text, cpm_y2::text, cpm_y3::text,
              avg_viewership::text, notes
       from fsp_media_revenue_cpm
       where sport_id = $1::uuid
         and notes like '%' || $2 || '%'
       order by channel`,
      [sportId, mediaDraftId]
    ),
    pool.query(
      `select id::text, sponsor_name, segment, tier::text, contract_status::text,
              year_1_value::text, year_2_value::text, year_3_value::text,
              currency_code, contract_start::text, contract_end::text
       from fsp_sponsorships
       where sponsor_name = $1
       order by created_at desc`,
      [`QA Sports Partner ${sponsorRunId}`]
    ),
    pool.query(
      `select d.id::text as draft_id, d.source_document_id::text,
              s.source_system, s.source_identifier, s.source_name
       from ai_intake_drafts d
       join source_documents s on s.id = d.source_document_id
       where d.id = any($1::uuid[])
       order by d.created_at`,
      [draftIds]
    ),
    pool.query(
      `select entity_id, trigger, action, agent_id
       from audit_log
       where entity_id = any($1::text[])
         and trigger in ('ai-intake:draft-created', 'ai-intake:draft-approved')
       order by created_at`,
      [draftIds]
    ),
  ]);

  const draftStatuses = drafts.rows.map((row) => row.status);
  if (draftStatuses.some((status) => status !== "posted")) {
    throw new Error(`Expected all drafts to be posted; got ${draftStatuses.join(", ")}`);
  }

  if (postingEvents.rows.length < 3) {
    throw new Error(`Expected at least 3 posting events; got ${postingEvents.rows.length}`);
  }
  if (mediaRows.rows.length !== 2) {
    throw new Error(`Expected 2 FSP media rows from media kit; got ${mediaRows.rows.length}`);
  }
  if (sponsorshipRows.rows.length < 1) {
    throw new Error("Expected one FSP sponsorship row from sponsorship document.");
  }
  if (sourceRows.rows.length !== 2) {
    throw new Error(`Expected 2 source document lineage rows; got ${sourceRows.rows.length}`);
  }
  if (auditRows.rows.length < 4) {
    throw new Error(`Expected at least 4 audit rows; got ${auditRows.rows.length}`);
  }

  return {
    drafts: drafts.rows,
    postingEvents: postingEvents.rows,
    mediaRows: mediaRows.rows,
    sponsorshipRows: sponsorshipRows.rows,
    sourceRows: sourceRows.rows,
    auditRows: auditRows.rows,
  };
}

async function main() {
  if (!CONFIRMED) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  loadEnv();
  for (const key of ["DATABASE_URL", "AUTH_SESSION_SECRET", "GEMINI_API_KEY"]) {
    if (!process.env[key]) throw new Error(`${key} is not set.`);
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL,
    allowExitOnIdle: true,
    max: 1,
  });

  try {
    const [actor, sport] = await Promise.all([getQaActor(pool), getSport(pool)]);
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

    const page = await fetchText(PAGE_URL, { headers: { cookie } });
    if (page.response.status !== 200) {
      throw new Error(`Cockpit route failed before intake test: ${page.response.status}`);
    }
    const createActionId = findActionId(page.text, "createAiIntakeDraftAction");
    if (!createActionId) throw new Error("Create action was not rendered on FSP sport cockpit page.");

    const mediaRunId = `QA-FSP-${Date.now().toString(36).toUpperCase()}-MEDIA`;
    const sponsorRunId = `QA-FSP-${Date.now().toString(36).toUpperCase()}-SPONSOR`;

    const mediaDraftId = await createDraft({
      cookie,
      actionId: createActionId,
      sportId: sport.id,
      targetKind: "fsp_sport_media_kit",
      runId: mediaRunId,
    });
    const sponsorshipDraftId = await createDraft({
      cookie,
      actionId: createActionId,
      sportId: sport.id,
      targetKind: "fsp_sport_sponsorship_document",
      runId: sponsorRunId,
    });

    const mediaApproval = await approveDraft({
      pool,
      cookie,
      draftId: mediaDraftId,
      targetKind: "fsp_sport_media_kit",
      runId: mediaRunId,
    });
    const sponsorshipApproval = await approveDraft({
      pool,
      cookie,
      draftId: sponsorshipDraftId,
      targetKind: "fsp_sport_sponsorship_document",
      runId: sponsorRunId,
    });

    const verified = await verifyResults(
      pool,
      [mediaDraftId, sponsorshipDraftId],
      mediaDraftId,
      sponsorRunId,
      sport.id
    );

    const renderCheck = await fetchText(`${PAGE_URL}&aiDraftId=${sponsorshipDraftId}`, {
      headers: { cookie },
    });
    if (
      renderCheck.response.status !== 200 ||
      !renderCheck.text.includes("Posting trail") ||
      !renderCheck.text.includes("Canonical updates")
    ) {
      throw new Error("Cockpit did not render posting trail for approved AI draft.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          appUrl: APP_URL,
          sport: sport.sport_code,
          runs: { mediaRunId, sponsorRunId },
          draftIds: { mediaDraftId, sponsorshipDraftId },
          actionIds: {
            createActionIdLength: createActionId.length,
            mediaReviewActionIdLength: mediaApproval.reviewActionIdLength,
            sponsorshipReviewActionIdLength: sponsorshipApproval.reviewActionIdLength,
          },
          approvals: {
            media: mediaApproval.location,
            sponsorship: sponsorshipApproval.location,
          },
          verified,
          cockpitRender: {
            status: renderCheck.response.status,
            hasPostingTrail: renderCheck.text.includes("Posting trail"),
            hasCanonicalUpdates: renderCheck.text.includes("Canonical updates"),
          },
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
