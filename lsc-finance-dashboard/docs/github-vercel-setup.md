# GitHub And Vercel Setup

## Goal

Put the project on a private GitHub repo, connect Vercel to that repo, and make preview deploys reproducible through source control.

## Current State

- the app is deployable from local prebuilt output
- the workspace already has a Vercel preview flow
- no GitHub remote is configured yet in this repo

## Recommended Setup Order

1. create a private GitHub repository
2. add the remote locally
3. push the current branch and main branch
4. connect the GitHub repo to Vercel
5. keep preview deployments protected
6. add production only after S3 and remaining security hardening are in place

## Local Git Commands

Run these once the private repo exists:

```bash
git remote add origin <your-private-github-url>
git branch -M main
git push -u origin main
```

If you are working from a feature branch:

```bash
git push -u origin <branch-name>
```

## Recommended GitHub Settings

- private repository
- branch protection on `main`
- require pull request review before merge
- require status checks before merge
- restrict force pushes

## Vercel Connection

In Vercel:

1. create or open the project
2. import the private GitHub repository
3. set the root directory to `lsc-finance-dashboard`
4. keep preview deployments protected
5. add environment variables for:
   - database
   - auth
   - Gemini
   - S3 storage

## CI Recommendation

This repo now includes a GitHub Actions workflow for:

- install
- typecheck
- build

File:

- `.github/workflows/ci.yml`

## Important Safety Notes

- do not commit `.env.local`
- do not store AWS keys in GitHub Actions unless needed
- prefer Vercel project env vars for runtime secrets
- if GitHub Actions needs cloud access later, use GitHub OIDC or short-lived credentials instead of long-lived secrets

## Practical Next Step

Once the GitHub repo is created, the clean rollout path is:

1. push repo
2. connect Vercel to GitHub
3. add env vars
4. verify preview deploy
5. turn on branch protection
