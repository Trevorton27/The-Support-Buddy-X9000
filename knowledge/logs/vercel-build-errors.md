# Vercel Build Error Log Summary

**Source Type:** LOG_SUMMARY
**Tags:** vercel, build, next.js, typescript, prisma, log-analysis
**Product Area:** Deployment
**Severity:** high

## Log Pattern Description
Build errors captured from Vercel deployment logs. These cover the most common failure
patterns seen in Next.js App Router applications using Prisma and Clerk.

## Sample Log Entries

### TypeScript Error
```
[build] Type error: Argument of type 'string | null' is not assignable
  to parameter of type 'string'.
  File: app/(dashboard)/tickets/[ticketId]/page.tsx:34:5
[build] Failed to compile.
[error] Command "npm run build" exited with 1
```

### Missing Environment Variable
```
[build] Error: Missing required environment variable: DATABASE_URL
  at parseEnv (lib/env.ts:8:11)
  at getEnv (lib/env.ts:36:18)
[error] Command "npm run build" exited with 1
```

### Prisma Client Not Generated
```
[build] Error: @prisma/client did not initialize yet. Please run "prisma generate"
[build] Error occurred prerendering page "/dashboard"
[error] Command "npm run build" exited with 1
```

### Server Component Importing Client Code
```
[build] Error: You're importing a component that needs useState. It only works in a Client Component
  but none of its parents are marked with "use client"
  File: app/(dashboard)/investigations/page.tsx
[error] Command "npm run build" exited with 1
```

## Diagnostic Interpretation
- **TypeScript error:** Find the file and line number in the error. Fix the null safety issue —
  add a null check or use optional chaining.
- **Missing env var:** The variable is not set in Vercel for this environment. Add it in
  Vercel → Project → Settings → Environment Variables for the correct scope.
- **Prisma not generated:** Add `"postinstall": "prisma generate"` to `package.json`. This
  runs after `npm install` on every Vercel deployment.
- **Server/Client boundary:** The component uses React hooks but doesn't have `"use client"`.
  Add it to the component file or move the logic to a separate client component.

## Build Log Access
Full build logs are available at:
Vercel Dashboard → Project → Deployments → [deployment] → Build Logs

Logs are retained for 30 days.

## Related References
- Runbook: Vercel Deployment Failures
- Alert: Deployment Failure Alert
- Architecture Doc: Deployment Pipeline and Infrastructure Overview
