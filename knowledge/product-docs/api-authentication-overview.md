# API Authentication Overview

**Source Type:** PRODUCT_DOC
**Tags:** api-keys, authentication, oauth, bearer-token, security
**Product Area:** Authentication
**Severity:** medium

## Authentication Methods
The API supports two authentication methods: API Keys and OAuth 2.0.

## API Keys
API keys are the simplest way to authenticate. Include the key in the `Authorization` header:
```
Authorization: Bearer sk_live_your_api_key_here
```

**Key prefixes:**
- `sk_live_` — Production API key
- `sk_test_` — Test/sandbox API key

**Key management:**
- Create and manage keys at Dashboard → Settings → API Keys
- Keys have no expiry by default — rotate them periodically as a security best practice
- Rotating a key immediately invalidates the old key (24-hour grace period for active keys)
- **Rotating a key also regenerates your webhook signing secret**

## OAuth 2.0
For applications acting on behalf of users, use the OAuth 2.0 Authorization Code flow with PKCE.

**Supported grant types:**
- Authorization Code + PKCE (recommended for web and mobile apps)
- Client Credentials (for server-to-server integrations)

**Token endpoints:**
- Authorization: `https://app.example.com/oauth/authorize`
- Token: `https://app.example.com/oauth/token`
- Revoke: `https://app.example.com/oauth/revoke`

**Token lifetimes:**
- Access token: 1 hour
- Refresh token: 30 days
- Refresh token rotation: enabled (each use issues a new refresh token)

**Security events that invalidate all refresh tokens for a user:**
- Password reset
- Account suspension
- Manual revocation from dashboard

## Rate Limiting
All API requests are rate-limited per API key. Limits are shown in response headers:
- `X-RateLimit-Limit` — Requests allowed per minute
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets

Limits by plan:
- Free: 10 req/min
- Pro: 100 req/min
- Enterprise: Custom (default 1000 req/min)

## Security Best Practices
1. Never expose API keys in client-side code or public repositories
2. Use environment variables to store keys
3. Use test keys (`sk_test_`) in development and staging
4. Rotate keys immediately if compromised — contact support for emergency rotation assistance
5. Use the minimum required OAuth scopes
