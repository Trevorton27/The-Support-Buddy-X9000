# Deployment Pipeline and Infrastructure Overview

**Source Type:** ARCHITECTURE_DOC
**Tags:** deployment, vercel, ci-cd, github-actions, infrastructure, docker
**Product Area:** Deployment
**Severity:** low

## Overview
The application is deployed on Vercel using GitHub-based CI/CD. Every push to `main` triggers
a Production deployment. Pull requests create Preview deployments with isolated URLs.

## Deployment Flow
```
Developer pushes to GitHub
  → GitHub Actions: lint + typecheck + tests
  → On success: Vercel deployment triggered automatically
  → Vercel: npm ci → postinstall (prisma generate) → next build
  → On success: deployment promoted to live URL
  → On failure: deployment cancelled, previous version stays live
```

## Environment Structure
| Environment | Branch    | Database         | Vercel URL        |
|-------------|-----------|------------------|-------------------|
| Production  | main      | Neon production  | app.yourdomain.com|
| Preview     | PRs       | Neon dev branch  | pr-N.vercel.app   |
| Development | local     | Docker Postgres  | localhost:3000    |

## Required Build Configuration

### package.json
```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "build": "next build"
  }
}
```
The `postinstall` script ensures Prisma client is generated before the build step.

### next.config.ts
```typescript
const config: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],
};
```
Required for Prisma to work in Next.js App Router serverless functions.

## Environment Variables
Required in Vercel Production and Preview:
- `DATABASE_URL` — Neon pooler connection string
- `OPENAI_API_KEY` — LLM and embedding calls
- `CLERK_SECRET_KEY` — Server-side Clerk auth
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Client-side Clerk
- `INNGEST_EVENT_KEY` — Event queue authentication
- `INNGEST_SIGNING_KEY` — Webhook signature verification

Variables must be set per environment (Production, Preview, Development) — they are not
automatically shared between environments.

## Rollback
Vercel maintains a deployment history. Rolling back:
1. Vercel Dashboard → Deployments
2. Select the target deployment
3. Click "Promote to Production"

Rollback takes approximately 30 seconds.

## Related References
- Runbook: Vercel Deployment Failures
- Runbook: CI/CD Pipeline Failures
- Alert: Deployment Failure Alert
