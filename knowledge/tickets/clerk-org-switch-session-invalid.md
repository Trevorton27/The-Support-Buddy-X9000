# Clerk Organization Switch Invalidates Active Session

**Source Type:** SUPPORT_TICKET
**Tags:** clerk, organizations, session, authentication, multi-tenant
**Product Area:** Authentication
**Severity:** medium

## Ticket Summary
Customer reported that when users switch between organizations in their multi-tenant app,
they are occasionally redirected to the sign-in page instead of the new organization's
dashboard. The issue occurred intermittently — about 1 in 10 organization switches triggered
the redirect. The customer was using Clerk's `OrganizationSwitcher` component.

## Root Cause
The customer's middleware was checking `orgId` from `auth()` and redirecting to sign-in if
it was null. During an organization switch, there is a brief period between when the active
organization is changed and when the session token is updated with the new `orgId`. The
middleware was executing during this window and seeing a null `orgId`, treating it as
an unauthenticated session.

## Resolution Applied
1. Reviewed the customer's `middleware.ts` — found strict `orgId` null check redirecting to `/sign-in`.
2. Updated the middleware logic to distinguish between "no user" (redirect to sign-in) and
   "user with no active org" (redirect to org selection page instead of sign-in).
3. Added the `/org-selection` route as a public route to prevent redirect loops.
4. Changed the redirect target for missing `orgId` from `/sign-in` to `/org-selection` which
   allows users to pick an organization without losing their session.

## Time to Resolution
1.5 hours

## Lessons Learned
- Middleware `orgId` checks must distinguish between unauthenticated users and authenticated
  users without an active organization — these are different states requiring different handling.
- `OrganizationSwitcher` has a brief async gap during switching — middleware must be tolerant of
  transient null `orgId` for authenticated users.
- Always have a dedicated org selection page separate from the sign-in page.

## Related References
- Runbook: Clerk Middleware Misconfiguration
- Product Doc: Organization and Multi-Tenancy Overview
- Architecture Doc: Authentication and Session Flow
