# API Gateway Architecture

**Source Type:** ARCHITECTURE_DOC
**Tags:** api-gateway, routing, authentication, rate-limiting, middleware
**Product Area:** API
**Severity:** low

## Overview
All API requests flow through a centralized API gateway layer before reaching service handlers.
The gateway is responsible for authentication, rate limiting, request logging, and routing.

## Request Flow
```
Client Request
  → Edge CDN (Vercel Edge Network)
  → Middleware (auth check, rate limit header injection)
  → API Route Handler
  → Service Layer (DB, LLM, integrations)
  → Response
```

## Middleware Responsibilities
1. **Authentication:** Validate Clerk session token or API key. Attach `userId` and `orgId` to request context.
2. **Rate Limiting:** Check request count against Redis counters. Inject `X-RateLimit-*` headers. Return 429 if exceeded.
3. **Request ID:** Generate and attach a unique `X-Request-Id` for log correlation.
4. **Logging:** Emit structured log entry with method, path, userId, orgId, request ID.

## Public vs. Protected Routes
Routes are categorized in `middleware.ts`:
- **Public:** `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks/(.*)`
- **Protected:** All others require valid Clerk session or API key

Webhook routes must be public — Inngest, Stripe, and other external services cannot authenticate
via Clerk.

## API Key Authentication
For server-to-server requests, API keys are passed in the `Authorization: Bearer` header.
The gateway validates the key against the database and attaches the associated `orgId`.
API key lookups are cached in Redis with a 5-minute TTL.

## Rate Limit Implementation
Rate limits are tracked in Redis using a sliding window algorithm:
- Key: `rate_limit:{apiKeyId}:{window_start_unix}`
- Increment on each request
- Expire after 2 × window duration
- Limit based on organization plan (looked up with 5-minute cache)

## Error Response Format
All API errors follow a consistent format:
```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "requestId": "req_abc123"
}
```

## Related References
- Product Doc: API Authentication Overview
- Product Doc: Rate Limiting Policy and Headers
- Architecture Doc: Authentication and Session Flow
