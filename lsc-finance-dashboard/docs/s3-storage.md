# S3 Document Storage

## Goal

Move uploaded receipts, invoices, contracts, and support files out of inline preview blobs and into private object storage.

This app now supports two document-storage modes:

- `inline`
  - default fallback
  - stores image previews in `source_documents.metadata.preview_data_url`
  - useful for local development and safe fallback when S3 is not configured

- `s3`
  - preferred production mode
  - stores uploaded source files in a private bucket
  - keeps only storage metadata in Postgres
  - serves previewable images through signed URLs

## Recommended Bucket Model

- one private bucket for finance documents
- no public read
- signed URLs only
- versioning enabled
- server-side encryption enabled

Recommended object key shape:

- `source-documents/<company>/<workflow>/<yyyy>/<mm>/<dd>/<hash>-<file>`

## Environment Variables

Set these locally and in Vercel when you are ready to enable S3:

- `DOCUMENT_STORAGE_BACKEND=s3`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
  - optional
- `S3_BUCKET`
- `S3_ENDPOINT`
  - optional for S3-compatible storage
- `S3_FORCE_PATH_STYLE`
  - optional for S3-compatible storage
- `S3_SIGNED_URL_TTL_SECONDS`
  - optional, default is `900`

## Current Runtime Behavior

When `DOCUMENT_STORAGE_BACKEND=s3` and the bucket config is present:

1. uploads are written to S3
2. `source_documents.metadata.document_storage` stores:
   - bucket
   - key
   - mime type
   - file name
   - size
   - upload timestamp
3. image previews are generated through signed URLs
4. existing inline-preview rows continue to work

When S3 is not configured:

1. the app falls back to inline image preview storage
2. existing workflows keep working
3. no product flow changes are required

## Security Notes

- keep the bucket private
- scope IAM access to this bucket only
- do not allow list/write on unrelated buckets
- do not commit AWS secrets into repo files
- prefer IAM role or Vercel-managed env vars in hosted environments

## What Is Not Done Yet

- historical inline-preview rows are not automatically migrated to S3
- PDF rendering still needs a dedicated preview surface if you want full in-app PDF previews
- deletion/retention policies are not automated yet

## Suggested Next Infrastructure Step

After S3 is connected:

1. upload a non-sensitive receipt in preview
2. confirm it appears with a signed preview
3. confirm `source_documents.metadata.document_storage` is populated
4. then start migrating future production uploads to S3-only mode
