# Clerk Middleware Misconfiguration Runbook

**Source Type:** RUNBOOK
**Tags:** clerk, middleware, authentication, next.js, routing, organizations
**Product Area:** Authentication
**Severity:** high

## Symptoms
- All routes returning 401 or redirect to sign-in unexpectedly
- Public routes being protected when they should be open
- Webhook endpoints blocked by auth middleware
- Organization switching not working correctly
- `auth()` returning null userId in Server Components that should be protected
- Infinite redirect loops between app and Clerk sign-in page
- API routes returning HTML (Clerk sign-in page) instead of JSON

## Possible Causes
1. `middleware.ts` not exporting a `matcher` config — runs on all routes including static assets
2. Public routes pattern missing from `clerkMiddleware` public routes config
3. Webhook route not excluded from auth — Inngest/Stripe webhooks need to be public
4. Middleware file in wrong location (must be `src/middleware.ts` or `middleware.ts` at root)
5. `clerkMiddleware` wrapping logic incorrect — missing `async` or incorrect route check
6. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` not set in environment
7. Organization middleware logic checking wrong claim
8. `afterAuth` deprecated — using old Clerk v4 API with v5/v6 SDK

## Investigation Steps
1. Confirm `middleware.ts` is at the project root (same level as `app/`) not inside `app/`
2. Check the `matcher` in middleware config — it should exclude `_next/static`, `_next/image`, `favicon.ico`
3. Verify public routes are correctly specified: `"/", "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)"`
4. Check Clerk SDK version — v5+ uses `clerkMiddleware()` not `withClerkMiddleware()` or `authMiddleware()`
5. Confirm `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in the environment (both locally and on Vercel)
6. Test the specific route failing with `curl -I` to see the exact response
7. Add `console.log` in middleware to confirm it's executing and what `isPublicRoute` returns
8. Check if the issue appeared after a Clerk SDK version upgrade

## Resolution
- **Wrong middleware API:** Update to `clerkMiddleware` from `@clerk/nextjs/server`. Remove any usage of `withClerkMiddleware` or `authMiddleware`.
- **Missing public route:** Add the route pattern to the `isPublicRoute` check in middleware.
- **Webhook blocked:** Add `/api/webhooks/(.*)` to public routes — Inngest and payment webhooks must not require auth.
- **Wrong location:** Move `middleware.ts` to project root. Next.js only recognizes it there.
- **Org middleware:** Use `auth().orgId` to check organization context — do not rely on JWT claims directly.

## Escalation Criteria
- Entire application locked out after middleware change (immediate rollback needed)
- Auth failures happening in production but not reproducible locally
- Clerk service outage causing auth failures across all customers
- Security-sensitive: public routes accidentally protected or protected routes accidentally public

## Related References
- Product Doc: Organization and Multi-Tenancy Overview
- Architecture Doc: Authentication and Session Flow
- Incident Report: SAML Provider Outage
