# Deployment Preview Setup

## Goal

Deploy the app as a protected preview so you can inspect the product safely before any broader rollout.

## Recommended Host

- Vercel

This repo is already structured for a Vercel deployment from the project root:

- `vercel.json`
- workspace-aware `pnpm` build
- Next.js app in `apps/web`

## Deployment Mode

Use a protected preview first, not an open production deployment.

Recommended protection settings in Vercel:

- enable Vercel Authentication
- keep preview deployments protected
- do not index deployment URLs
- do not share public URLs widely while finance data is live

## Required Environment Variables

Add these in the Vercel project settings before the preview is used with live data:

- `DATABASE_URL_ADMIN`
- `LSC_APP_READ_PASSWORD`
- `LSC_IMPORT_RW_PASSWORD`
- `LSC_DATA_BACKEND=database`
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.5-flash`

Optional if you later use explicit derived role URLs:

- `DATABASE_URL_APP_READ`
- `DATABASE_URL_IMPORT`

Optional if you enable private S3-backed file storage:

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

## Important Safety Rule

- do not paste raw secrets into repo files
- keep `.env.local` local only
- set Vercel env vars in the Vercel dashboard or CLI

## Recommended First Preview Flow

1. deploy protected preview
2. verify Overview, TBR, Costs, Payments, Commercial Goals, Documents
3. verify `/documents` upload and approval path with non-sensitive test files first
4. only then consider a production environment

## After Preview

Once the UI is visible and reviewed, the next high-value product work should be:

- Google Drive vendor invoice intake
- in-app reimbursement approval workflow
- expense submission module with admin approval
- private S3-backed document storage
