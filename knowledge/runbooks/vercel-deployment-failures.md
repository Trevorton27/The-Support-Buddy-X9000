# Vercel Deployment Failure Runbook

**Source Type:** RUNBOOK
**Tags:** vercel, deployment, build, next.js, environment-variables, ci-cd
**Product Area:** Deployment
**Severity:** high

## Symptoms
- Vercel deployment failing at build step
- "Build failed" status in Vercel dashboard
- Application returning 500 errors immediately after deployment
- Environment variables missing in production after deploy
- TypeScript or ESLint errors blocking deployment
- Prisma client not generated during build

## Possible Causes
1. Missing or incorrect environment variables in Vercel project settings
2. `prisma generate` not running before build (missing `postinstall` script)
3. Node.js version mismatch between local and Vercel
4. Build command missing or incorrect in `vercel.json` or `package.json`
5. Dependency not in `dependencies` (only in `devDependencies`) but needed at runtime
6. TypeScript errors that pass locally but fail in strict mode on Vercel
7. Importing server-only modules in client components (Next.js App Router violation)
8. `next.config.ts` misconfiguration causing build failures
9. Out-of-memory during build for large applications

## Investigation Steps
1. Review the full build log in Vercel dashboard — identify the exact line and error message
2. Check which build step failed: install, generate, build, or deployment
3. Verify all required environment variables are set in Vercel → Settings → Environment Variables
4. Check `package.json` for `postinstall` script — should include `prisma generate` if using Prisma
5. Verify the Node.js version in Vercel matches what's in `.nvmrc` or `package.json` engines field
6. Try running `npm run build` locally with the same environment variables to reproduce
7. Check for `"use client"` / `"use server"` boundary violations in recent commits
8. Review `next.config.ts` for any changes in the failing commit

## Resolution
- **Missing env vars:** Add them in Vercel → Project → Settings → Environment Variables. Don't forget to set for the correct environment (Production/Preview/Development).
- **Prisma not generated:** Add `"postinstall": "prisma generate"` to `package.json` scripts. This runs automatically after `npm install` on Vercel.
- **TypeScript errors:** Fix type errors locally. Vercel uses `next build` which runs `tsc`. Don't use `// @ts-ignore` as a fix — address root cause.
- **OOM during build:** Increase Vercel build memory in `vercel.json`: `{ "build": { "env": { "NODE_OPTIONS": "--max-old-space-size=4096" } } }`
- **Dependency issue:** Move the package from `devDependencies` to `dependencies` in `package.json`.

## Escalation Criteria
- Build consistently failing despite correct configuration (possible Vercel platform issue)
- Production deployment failing with no changes to codebase (infrastructure issue)
- Deployment succeeds but application crashes immediately on first request
- Vercel status page showing ongoing incident

## Related References
- Support Ticket: Vercel Build Failing — Missing Environment Variable
- Alert: Deployment Failure Alert
- Architecture Doc: Deployment Pipeline and Infrastructure Overview
- Log Summary: Vercel Build Error Log Summary
