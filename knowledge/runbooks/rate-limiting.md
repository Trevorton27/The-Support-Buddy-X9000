# Rate Limiting and Backoff Strategy Runbook

**Source Type:** RUNBOOK
**Tags:** rate-limiting, 429, backoff, throttling, api
**Product Area:** API
**Severity:** medium

## Symptoms
- Customer receives HTTP 429 Too Many Requests responses
- API calls failing intermittently during peak usage
- Bulk import or data sync jobs hitting rate limits
- Customers reporting "quota exceeded" errors
- SDK throwing RateLimitError exceptions

## Possible Causes
1. Customer sending requests faster than their plan's rate limit allows
2. Bulk import or batch job not implementing request spacing
3. Retry logic without backoff causing a retry storm
4. Multiple application instances sharing the same API key multiplying effective request rate
5. Customer accidentally triggering recursive webhook loops
6. Rate limit applied per-IP causing issues behind a NAT or shared egress IP
7. Customer on free plan hitting lower limits that pro/enterprise customers wouldn't encounter

## Investigation Steps
1. Check the rate limit headers in the 429 response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
2. Review the customer's request patterns in our API logs — look for burst patterns vs. sustained high volume
3. Identify which specific API endpoint is being rate-limited
4. Check if the customer is using multiple API keys or a single shared key
5. Look for retry loops — sometimes bad retry logic causes exponential increase in requests
6. Check the customer's plan limits vs. their actual usage patterns
7. Determine if the customer has a legitimate need for higher limits (bulk migration, one-time sync)

## Resolution
- **Bulk jobs:** Advise customer to implement exponential backoff with jitter. Recommended: start at 1s, max 64s, jitter ±25%.
- **Batch API:** Suggest switching to batch endpoints where available instead of individual requests.
- **Temporary limit increase:** For one-time bulk migrations, engineering can temporarily raise limits. Requires manager approval.
- **Plan upgrade:** If sustained high volume is legitimate use case, recommend upgrading plan.
- **Rate limit headers:** Share sample code showing how to read `X-RateLimit-Reset` and wait before retrying.
- **Webhook loops:** If customer is triggering webhooks that call our API and those trigger more webhooks, help them add idempotency checks.

## Escalation Criteria
- Customer claims they are below their plan limits but still receiving 429s (possible misconfiguration)
- Rate limit affecting a live customer-facing workflow during business hours
- Enterprise customer requesting permanent limit increase above standard tiers
- Multiple customers from the same IP range affected (possible shared infrastructure issue)

## Related References
- Support Ticket: Rate Limit Exceeded During Bulk Data Import
- Product Doc: Rate Limiting Policy and Headers
- Log Summary: Rate Limit Exceeded Log Summary
