import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";

const { Client } = pg;
const execFileAsync = promisify(execFile);

const DEFAULT_INVOICE_DIR = "/Users/anujsingh/Downloads/S2 invoices";
const MAX_INLINE_PREVIEW_BYTES = 2 * 1024 * 1024;

async function loadEnvFile(envPath) {
  try {
    const content = await fs.readFile(envPath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separator = line.indexOf("=");
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

function deriveDatabaseUrl() {
  return process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
}

function storageBackend() {
  return (process.env.DOCUMENT_STORAGE_BACKEND ?? "inline").trim().toLowerCase();
}

function isS3Enabled() {
  return storageBackend() === "s3" && Boolean(process.env.S3_BUCKET) && Boolean(process.env.AWS_REGION || process.env.S3_ENDPOINT);
}

function s3Client() {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID ?? "").trim().replace(/[\r\n]/g, "");
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY ?? "").trim().replace(/[\r\n]/g, "");

  return new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: ["1", "true", "yes"].includes((process.env.S3_FORCE_PATH_STYLE ?? "").trim().toLowerCase()),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {})
  });
}

function sanitizePathSegment(value) {
  return String(value || "documents")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function objectKey({ fileName, fileHash }) {
  const originalName = fileName.trim();
  const nameWithoutExtension = originalName.includes(".")
    ? originalName.slice(0, originalName.lastIndexOf("."))
    : originalName;
  const safeName = sanitizePathSegment(nameWithoutExtension) || "invoice";
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return [
    "source-documents",
    "tbr",
    "tbr-e1-accounting-s2",
    yyyy,
    mm,
    dd,
    `${fileHash.slice(0, 16)}-${safeName}.pdf`
  ].join("/");
}

async function storePdf({ buffer, fileName, fileHash }) {
  const mimeType = "application/pdf";

  if (!isS3Enabled()) {
    const previewDataUrl =
      buffer.byteLength <= MAX_INLINE_PREVIEW_BYTES
        ? `data:${mimeType};base64,${buffer.toString("base64")}`
        : null;
    return {
      storageMetadata: null,
      previewDataUrl,
      previewMimeType: previewDataUrl ? mimeType : null
    };
  }

  const bucket = process.env.S3_BUCKET;
  const key = objectKey({ fileName, fileHash });
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        filehash: fileHash,
        company: "TBR",
        workflow: "tbr-e1-accounting-s2",
        originalfilename: fileName
      }
    })
  );

  return {
    storageMetadata: {
      backend: "s3",
      bucket,
      key,
      mimeType,
      fileName,
      fileSize: buffer.byteLength,
      region: process.env.AWS_REGION ?? null,
      endpoint: process.env.S3_ENDPOINT ?? null,
      uploadedAt: new Date().toISOString(),
      previewable: true
    },
    previewDataUrl: null,
    previewMimeType: null
  };
}

function invoiceKey(value) {
  const match = String(value ?? "").match(/\b(INV|CN)[\s-]*(\d{3,4})\b/i);
  if (!match) return null;
  return `${match[1].toUpperCase()}${match[2].padStart(4, "0")}`;
}

function displayInvoiceNumber(key) {
  if (!key) return null;
  const prefix = key.startsWith("CN") ? "CN" : "INV";
  return `${prefix} ${key.slice(prefix.length)}`;
}

async function extractText(filePath) {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"], {
      maxBuffer: 1024 * 1024 * 3
    });
    return stdout;
  } catch {
    return "";
  }
}

async function deriveInvoiceKey(filePath) {
  const fileName = path.basename(filePath);
  const fromName = invoiceKey(fileName);
  if (fromName) return fromName;

  const text = await extractText(filePath);
  const fromStructuredText = invoiceKey(text);
  if (fromStructuredText) return fromStructuredText;

  const plainInvoice = text.match(/\bINVOICE\s+NO\.\s*(\d{3,5})\b/i);
  if (plainInvoice) return `INV${plainInvoice[1].padStart(4, "0")}`;

  return null;
}

async function getInvoiceGroups(client) {
  const { rows } = await client.query(
    `select
       ts.id as season_id,
       e1.invoice_number,
       count(*)::integer as line_count
     from tbr_e1_accounting_lines e1
     join tbr_seasons ts on ts.id = e1.season_id
     where ts.season_code = 'S2'
       and e1.line_type <> 'source_check'
     group by ts.id, e1.invoice_number`
  );

  const map = new Map();
  for (const row of rows) {
    const key = invoiceKey(row.invoice_number);
    if (!key) continue;
    map.set(key, {
      seasonId: row.season_id,
      invoiceNumber: row.invoice_number,
      lineCount: Number(row.line_count)
    });
  }
  return map;
}

async function getTbrCompanyAndUser(client) {
  const { rows } = await client.query(
    `select
       (select id from companies where code = 'TBR'::company_code limit 1) as company_id,
       (select id from app_users where is_active = true and role in ('super_admin', 'finance_admin') order by role = 'super_admin' desc limit 1) as app_user_id`
  );
  const row = rows[0];
  if (!row?.company_id) throw new Error("TBR company not found.");
  if (!row?.app_user_id) throw new Error("No active finance admin user found for document intake events.");
  return { companyId: row.company_id, appUserId: row.app_user_id };
}

async function upsertSourceDocument(client, params) {
  const existing = await client.query(
    `select id from source_documents where source_system = $1 and source_identifier = $2 limit 1`,
    [params.sourceSystem, params.sourceIdentifier]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const stored = await storePdf({
    buffer: params.buffer,
    fileName: params.fileName,
    fileHash: params.fileHash
  });
  const metadata = {
    workflow: "tbr_e1_accounting",
    workflowContext: params.workflowContext,
    seasonCode: "S2",
    extracted_invoice_key: params.extractedInvoiceKey,
    matched_invoice_number: params.matchedInvoiceNumber,
    match_status: params.matchStatus,
    file_hash: params.fileHash,
    uploaded_by_script: "scripts/attach-e1-s2-invoices.mjs",
    uploaded_at: new Date().toISOString(),
    document_storage: stored.storageMetadata,
    preview_data_url: stored.previewDataUrl,
    preview_mime_type: stored.previewMimeType
  };

  const inserted = await client.query(
    `insert into source_documents (
       company_id,
       document_type,
       source_system,
       source_identifier,
       source_name,
       metadata
     )
     values ($1, 'invoice_file'::source_document_type, $2, $3, $4, $5::jsonb)
     returning id`,
    [
      params.companyId,
      params.sourceSystem,
      params.sourceIdentifier,
      params.fileName,
      JSON.stringify(metadata)
    ]
  );
  return inserted.rows[0].id;
}

async function main() {
  const projectRoot = process.cwd();
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, "apps", "web", ".env.local"));

  const databaseUrl = deriveDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL_ADMIN or DATABASE_URL is required.");

  const invoiceDir = process.argv[2] ?? DEFAULT_INVOICE_DIR;
  const fileNames = (await fs.readdir(invoiceDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".pdf"))
    .sort((left, right) => left.localeCompare(right));
  const filePaths = fileNames.map((fileName) => path.join(invoiceDir, fileName));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const matchedByInvoice = new Map();
  const summary = {
    invoiceDir,
    files: fileNames.length,
    matchedFiles: 0,
    unmatchedFiles: 0,
    linkedInvoiceGroups: 0,
    createdOrReusedSourceDocuments: 0,
    unmatched: [],
    matched: []
  };

  try {
    const invoiceGroups = await getInvoiceGroups(client);
    const { companyId, appUserId } = await getTbrCompanyAndUser(client);

    await client.query("begin");
    for (const filePath of filePaths) {
      const fileName = path.basename(filePath);
      const buffer = await fs.readFile(filePath);
      const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
      const extractedInvoiceKey = await deriveInvoiceKey(filePath);
      const matchedGroup = extractedInvoiceKey ? invoiceGroups.get(extractedInvoiceKey) : null;
      const matchStatus = matchedGroup ? "matched" : "unmatched";
      const workflowContext = matchedGroup
        ? `tbr-e1-accounting:S2:${matchedGroup.invoiceNumber}`
        : `tbr-e1-accounting:S2:unmatched:${extractedInvoiceKey ?? sanitizePathSegment(fileName)}`;
      const sourceDocumentId = await upsertSourceDocument(client, {
        companyId,
        sourceSystem: "e1_invoice_pdf_import",
        sourceIdentifier: `e1:s2:pdf:${fileHash}`,
        fileName,
        fileHash,
        buffer,
        workflowContext,
        extractedInvoiceKey,
        matchedInvoiceNumber: matchedGroup?.invoiceNumber ?? null,
        matchStatus
      });
      summary.createdOrReusedSourceDocuments += 1;

      await client.query(
        `insert into document_intake_events (
           source_document_id,
           company_id,
           app_user_id,
           source_file_name,
           workflow_context,
           intake_status,
           intake_note
         )
         select $1, $2, $3, $4, $5, 'uploaded', $6
         where not exists (
           select 1 from document_intake_events
           where source_document_id = $1
             and workflow_context = $5
         )`,
        [
          sourceDocumentId,
          companyId,
          appUserId,
          fileName,
          workflowContext,
          matchedGroup
            ? `Matched ${fileName} to ${matchedGroup.invoiceNumber}.`
            : `Uploaded but not matched to an S2 E1 invoice group. Extracted key: ${displayInvoiceNumber(extractedInvoiceKey) ?? "none"}.`
        ]
      );

      if (!matchedGroup) {
        summary.unmatchedFiles += 1;
        summary.unmatched.push({
          fileName,
          extractedInvoiceNumber: displayInvoiceNumber(extractedInvoiceKey)
        });
        continue;
      }

      await client.query(
        `insert into tbr_e1_invoice_documents (
           season_id,
           invoice_number,
           source_document_id,
           linked_by_user_id,
           notes
         )
         values ($1, $2, $3, $4, $5)
         on conflict (season_id, invoice_number, source_document_id)
         do update set
           linked_by_user_id = excluded.linked_by_user_id,
           notes = excluded.notes`,
        [
          matchedGroup.seasonId,
          matchedGroup.invoiceNumber,
          sourceDocumentId,
          appUserId,
          `Auto-linked from ${fileName}.`
        ]
      );

      if (!matchedByInvoice.has(matchedGroup.invoiceNumber)) {
        matchedByInvoice.set(matchedGroup.invoiceNumber, sourceDocumentId);
      }

      summary.matchedFiles += 1;
      summary.matched.push({
        fileName,
        extractedInvoiceNumber: displayInvoiceNumber(extractedInvoiceKey),
        matchedInvoiceNumber: matchedGroup.invoiceNumber
      });
    }

    for (const [invoiceNumber, sourceDocumentId] of matchedByInvoice.entries()) {
      await client.query(
        `update tbr_e1_accounting_lines
         set source_document_id = $2,
             metadata = metadata || $3::jsonb,
             updated_at = now()
         where season_code = 'S2'
           and invoice_number is not distinct from $1
           and line_type <> 'source_check'`,
        [
          invoiceNumber,
          sourceDocumentId,
          JSON.stringify({
            sourceDocumentLinkedBy: "scripts/attach-e1-s2-invoices.mjs",
            sourceDocumentLinkedAt: new Date().toISOString()
          })
        ]
      );
    }

    summary.linkedInvoiceGroups = matchedByInvoice.size;
    await client.query("commit");
    console.log(JSON.stringify(summary, null, 2));
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
