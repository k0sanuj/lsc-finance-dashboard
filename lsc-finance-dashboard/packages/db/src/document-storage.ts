import "server-only";

import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_INLINE_PREVIEW_BYTES = 2 * 1024 * 1024;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

declare global {
  // eslint-disable-next-line no-var
  var __lscDocumentS3Client: S3Client | undefined;
}

type RecordLike = Record<string, unknown>;

export type StoredDocumentMetadata = {
  backend: "s3";
  bucket: string;
  key: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  region: string | null;
  endpoint: string | null;
  uploadedAt: string;
  previewable: boolean;
};

type StoreUploadedDocumentParams = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  companyCode: string;
  workflowContext: string | null;
};

type StoreUploadedDocumentResult = {
  storageMetadata: StoredDocumentMetadata | null;
  previewDataUrl: string | null;
  previewMimeType: string | null;
};

type DocumentPreviewResult = {
  previewDataUrl: string | null;
  previewMimeType: string | null;
};

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" ? (value as RecordLike) : {};
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getConfiguredBucket() {
  return process.env.S3_BUCKET?.trim() || null;
}

function getConfiguredRegion() {
  return process.env.AWS_REGION?.trim() || null;
}

function getConfiguredEndpoint() {
  return process.env.S3_ENDPOINT?.trim() || null;
}

function getSignedUrlTtlSeconds() {
  const numeric = Number(process.env.S3_SIGNED_URL_TTL_SECONDS ?? DEFAULT_SIGNED_URL_TTL_SECONDS);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : DEFAULT_SIGNED_URL_TTL_SECONDS;
}

function getDocumentStorageBackend() {
  return (process.env.DOCUMENT_STORAGE_BACKEND ?? "inline").trim().toLowerCase();
}

function isPreviewableMimeType(mimeType: string) {
  return mimeType.startsWith("image/");
}

function buildInlinePreviewDataUrl(buffer: Buffer, mimeType: string) {
  if (!mimeType.startsWith("image/")) {
    return null;
  }

  if (buffer.byteLength > MAX_INLINE_PREVIEW_BYTES) {
    return null;
  }

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function getS3Client() {
  if (!globalThis.__lscDocumentS3Client) {
    globalThis.__lscDocumentS3Client = new S3Client({
      region: getConfiguredRegion() ?? "us-east-1",
      endpoint: getConfiguredEndpoint() ?? undefined,
      forcePathStyle: ["1", "true", "yes"].includes(
        (process.env.S3_FORCE_PATH_STYLE ?? "").trim().toLowerCase()
      )
    });
  }

  return globalThis.__lscDocumentS3Client;
}

function buildDocumentObjectKey(params: {
  companyCode: string;
  workflowContext: string | null;
  fileHash: string;
  fileName: string;
}) {
  const companySegment = sanitizePathSegment(params.companyCode || "company");
  const workflowSegment = sanitizePathSegment(params.workflowContext || "documents");
  const originalName = params.fileName.trim();
  const nameWithoutExtension = originalName.includes(".")
    ? originalName.slice(0, originalName.lastIndexOf("."))
    : originalName;
  const extension = originalName.includes(".") ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase() : "";
  const safeName = sanitizePathSegment(nameWithoutExtension) || "upload";
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return [
    "source-documents",
    companySegment,
    workflowSegment,
    yyyy,
    mm,
    dd,
    `${params.fileHash.slice(0, 16)}-${safeName}-${randomUUID().slice(0, 8)}${extension}`
  ].join("/");
}

export function isS3DocumentStorageEnabled() {
  return getDocumentStorageBackend() === "s3" && Boolean(getConfiguredBucket()) && Boolean(getConfiguredRegion() || getConfiguredEndpoint());
}

export function parseStoredDocumentMetadata(metadata: unknown) {
  const record = asRecord(metadata);
  const storage = asRecord(record.document_storage);

  if (storage.backend !== "s3" || typeof storage.bucket !== "string" || typeof storage.key !== "string") {
    return null;
  }

  return {
    backend: "s3",
    bucket: storage.bucket,
    key: storage.key,
    mimeType: typeof storage.mimeType === "string" ? storage.mimeType : "application/octet-stream",
    fileName: typeof storage.fileName === "string" ? storage.fileName : "uploaded-document",
    fileSize: Number(storage.fileSize ?? 0),
    region: typeof storage.region === "string" ? storage.region : null,
    endpoint: typeof storage.endpoint === "string" ? storage.endpoint : null,
    uploadedAt: typeof storage.uploadedAt === "string" ? storage.uploadedAt : new Date().toISOString(),
    previewable: Boolean(storage.previewable)
  } satisfies StoredDocumentMetadata;
}

export function hasDocumentPreview(metadata: unknown) {
  const record = asRecord(metadata);
  if (typeof record.preview_data_url === "string" && record.preview_data_url.length > 0) {
    return true;
  }

  const stored = parseStoredDocumentMetadata(metadata);
  return Boolean(stored?.previewable);
}

export async function resolveDocumentPreview(metadata: unknown): Promise<DocumentPreviewResult> {
  const record = asRecord(metadata);
  const inlinePreview = typeof record.preview_data_url === "string" ? record.preview_data_url : null;
  const inlineMimeType = typeof record.preview_mime_type === "string" ? record.preview_mime_type : null;

  if (inlinePreview) {
    return {
      previewDataUrl: inlinePreview,
      previewMimeType: inlineMimeType
    };
  }

  const stored = parseStoredDocumentMetadata(metadata);
  if (!stored || !stored.previewable || !isS3DocumentStorageEnabled()) {
    return {
      previewDataUrl: null,
      previewMimeType: null
    };
  }

  const previewDataUrl = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: stored.bucket,
      Key: stored.key,
      ResponseContentType: stored.mimeType
    }),
    { expiresIn: getSignedUrlTtlSeconds() }
  );

  return {
    previewDataUrl,
    previewMimeType: stored.mimeType
  };
}

export async function storeUploadedDocument(
  params: StoreUploadedDocumentParams
): Promise<StoreUploadedDocumentResult> {
  if (!isS3DocumentStorageEnabled()) {
    const previewDataUrl = buildInlinePreviewDataUrl(params.buffer, params.mimeType);
    return {
      storageMetadata: null,
      previewDataUrl,
      previewMimeType: previewDataUrl ? params.mimeType : null
    };
  }

  const bucket = getConfiguredBucket() as string;
  const key = buildDocumentObjectKey({
    companyCode: params.companyCode,
    workflowContext: params.workflowContext,
    fileHash: params.fileHash,
    fileName: params.fileName
  });

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.mimeType,
      Metadata: {
        filehash: params.fileHash,
        company: params.companyCode,
        workflow: sanitizePathSegment(params.workflowContext || "documents"),
        originalfilename: params.fileName
      }
    })
  );

  return {
    storageMetadata: {
      backend: "s3",
      bucket,
      key,
      mimeType: params.mimeType,
      fileName: params.fileName,
      fileSize: params.fileSize,
      region: getConfiguredRegion(),
      endpoint: getConfiguredEndpoint(),
      uploadedAt: new Date().toISOString(),
      previewable: isPreviewableMimeType(params.mimeType)
    },
    previewDataUrl: null,
    previewMimeType: null
  };
}
