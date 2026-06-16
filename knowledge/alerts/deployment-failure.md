# Deployment Failure Alert

**Source Type:** ALERT
**Tags:** alert, deployment, vercel, build, ci-cd, monitoring
**Product Area:** Deployment
**Severity:** medium

## Alert Definition
**Name:** deployment_failure
**Threshold:** Vercel deployment status = "Error" or GitHub Actions workflow failure on main branch
**Severity:** P2 (blocks production deployments; no immediate user impact if previous version is live)
**Channel:** Slack #deployments, email to on-call engineer

## What This Alert Means
A production deployment has failed. The previous version of the application remains live.
No immediate user impact, but the deployment pipeline is blocked until the issue is resolved.

## Immediate Actions
1. Review the Vercel build log for the specific error message
2. Check if the failure is in: install, generate (Prisma), build (next build), or deployment
3. Check if the failure corresponds to a recent commit — review the diff
4. Attempt to reproduce the build failure locally: `npm run build`

## Common Causes
- **TypeScript error:** Fix the type error in the failing file
- **Missing environment variable:** Add it to Vercel project settings
- **Prisma generate failed:** Check `postinstall` script; ensure `@prisma/client` is in dependencies
- **ESLint error:** Fix the lint error or assess if rule should be adjusted
- **Build OOM:** Add `NODE_OPTIONS=--max-old-space-size=4096` to build environment
- **Test failure (CI):** Fix the failing test before merging

## If Hotfix Is Needed
If a critical bug was deployed and a fix is urgent but the pipeline is broken:
1. Fix the deployment issue first — do not deploy to production with a broken pipeline
2. If the pipeline issue cannot be fixed quickly, revert the breaking commit via Vercel
   Dashboard → Deployments → Promote previous deployment

## Related References
- Runbook: Vercel Deployment Failures
- Runbook: CI/CD Pipeline Failures
- Architecture Doc: Deployment Pipeline and Infrastructure Overview
