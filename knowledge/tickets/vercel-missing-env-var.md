# Vercel Build Failing: Missing Environment Variable in Production

**Source Type:** SUPPORT_TICKET
**Tags:** vercel, environment-variables, build, next.js, deployment
**Product Area:** Deployment
**Severity:** high

## Ticket Summary
Customer's production deployment on Vercel started failing after they added a new required
environment variable locally. The build was succeeding in Preview deployments but failing
in Production. The error was: `Error: Missing required environment variable: STRIPE_SECRET_KEY`.

## Root Cause
The customer had added the environment variable in Vercel's project settings scoped only to
"Preview" environments. It was not added to the "Production" environment. Vercel allows
environment variables to be scoped to Development, Preview, and Production independently.
The customer assumed adding it to Preview covered all environments.

## Resolution Applied
1. Identified the missing variable by reviewing the build log error message.
2. Navigated to Vercel → Project → Settings → Environment Variables.
3. Found `STRIPE_SECRET_KEY` was set for Preview but not Production.
4. Added the variable for Production environment.
5. Triggered a new Production deployment — build succeeded.

## Time to Resolution
20 minutes

## Lessons Learned
- Vercel's per-environment variable scoping is a frequent source of confusion. Variables must be
  explicitly added to each environment scope (Development/Preview/Production).
- When adding new required environment variables, always check all three environment scopes.
- The error message correctly identified the missing variable by name — this made diagnosis fast.
- Consider adding a pre-deployment checklist that validates all required env vars are present
  before the build starts.

## Related References
- Runbook: Vercel Deployment Failures
- Log Summary: Vercel Build Error Log Summary
