# Rate Limiting Policy and Headers

**Source Type:** PRODUCT_DOC
**Tags:** rate-limiting, 429, headers, throttling, backoff, api
**Product Area:** API
**Severity:** medium

## Overview
Rate limits protect platform stability and ensure fair resource distribution across all customers.
Limits are applied per API key, per minute.

## Rate Limit Tiers
| Plan       | Requests/min | Burst allowance |
|------------|-------------|-----------------|
| Free       | 10          | Up to 20 for 10s|
| Pro        | 100         | Up to 150 for 10s|
| Enterprise | 1000        | Custom          |

## Rate Limit Headers
Every API response includes rate limit information:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1720000060
X-RateLimit-Window: 60
```

When a rate limit is exceeded, the API returns HTTP 429 with a `Retry-After` header:
```
HTTP/1.1 429 Too Many Requests
Retry-After: 23
Content-Type: application/json

{"error": "rate_limit_exceeded", "message": "Too many requests. Retry after 23 seconds."}
```

## Implementing Backoff
Always implement exponential backoff with jitter when handling 429 responses:

```javascript
async function apiCallWithRetry(fn, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fn();
    if (response.status !== 429) return response;

    const retryAfter = parseInt(response.headers.get('Retry-After') || '1');
    const jitter = Math.random() * 1000;
    const delay = (retryAfter * 1000) + jitter;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('Max retries exceeded');
}
```

## Bulk Operations
For bulk imports or large data syncs, use batch endpoints to reduce request count:
- `POST /api/v1/records/batch` — Up to 100 records per request
- `POST /api/v1/events/batch` — Up to 500 events per request

## Requesting Higher Limits
For legitimate high-volume use cases, contact support to discuss:
- Temporary limit increases for one-time migrations
- Enterprise plan with custom limits
- Dedicated infrastructure for very high volume

## Best Practices
1. Read `X-RateLimit-Remaining` proactively — don't wait for a 429 to throttle
2. Implement exponential backoff, not fixed-interval polling
3. Use batch endpoints for bulk operations
4. Use multiple API keys across different services only if each service genuinely needs independent limits
