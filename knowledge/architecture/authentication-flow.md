# Authentication and Session Flow

**Source Type:** ARCHITECTURE_DOC
**Tags:** authentication, session, clerk, jwt, middleware, organizations
**Product Area:** Authentication
**Severity:** low

## Overview
Authentication is handled by Clerk. Sessions are short-lived JWTs refreshed automatically
by the Clerk SDK. All protected routes validate the session via `middleware.ts`.

## Session Token Flow
```
User logs in (Clerk-hosted UI or embedded component)
  → Clerk issues session token (JWT, 1-hour expiry)
  → Token stored in HTTP-only cookie by Clerk SDK
  → On each request: middleware calls auth() to validate token
  → auth() returns { userId, orgId, orgRole, sessionId }
  → Route handler uses userId/orgId for DB queries
```

## Middleware Authentication
```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});
```

## Organization Context
When a user has an active organization, `orgId` is included in the session JWT as a claim.
The active organization can be switched via `OrganizationSwitcher`, which:
1. Updates the active organization in Clerk
2. Rotates the session token to include the new `orgId`
3. Client-side: SDK automatically refreshes the token

During organization switching, there is a ~200ms window where `orgId` is null. Middleware
must not redirect authenticated users to `/sign-in` based solely on missing `orgId`.

## Server Component Auth
```typescript
// Server Component
import { auth } from '@clerk/nextjs/server';

export default async function Page() {
  const { userId, orgId } = await auth();
  if (!userId) redirect('/sign-in');
  // orgId may be null if user has no active org
}
```

## API Route Auth (via lib/auth.ts)
```typescript
// requireAuth — any authenticated user
const { userId } = await requireAuth();

// requireOrgAuth — authenticated + active organization
const { userId, orgId, orgRole } = await requireOrgAuth();
```

## Token Refresh
Clerk refreshes session tokens automatically on the client side before expiry.
Server-side route handlers always validate the current token — there is no server-side
caching of auth state.

## Security Events
Events that immediately invalidate all sessions for a user:
- Password change
- Account deletion
- Admin force sign-out
- Suspicious activity detection (Clerk-managed)

## Related References
- Runbook: Clerk Middleware Misconfiguration
- Product Doc: Organization and Multi-Tenancy Overview
- Support Ticket: Clerk Organization Switch Invalidates Active Session
