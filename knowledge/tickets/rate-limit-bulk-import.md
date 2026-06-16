# Rate Limit Exceeded During Bulk Data Import

**Source Type:** SUPPORT_TICKET
**Tags:** rate-limiting, 429, bulk-import, backoff, api
**Product Area:** API
**Severity:** medium

## Ticket Summary
Customer was migrating historical data from their old system and wrote a script to import 50,000
records via the API. The script was hitting the API as fast as possible with no throttling.
After processing ~2,000 records, the script started receiving 429 responses and eventually
failed entirely, leaving the import incomplete and in an inconsistent state.

## Root Cause
The customer's import script made requests in a tight loop with no rate limiting or backoff.
Our API enforces a limit of 100 requests per minute per API key on the Pro plan. The script
was attempting ~600 requests per minute. When 429 responses began, the script did not handle
them and crashed rather than waiting and retrying.

## Resolution Applied
1. Confirmed the customer's plan limit (100 req/min for Pro).
2. Provided a revised import script with:
   - Request spacing: `await sleep(700ms)` between requests (~85 req/min, safely under limit)
   - Exponential backoff on 429: start at 2s, double each retry, max 60s, max 3 retries
   - Progress checkpointing: save last successful record ID so restart resumes where it left off
3. Temporarily raised customer's rate limit to 300 req/min for 24 hours to complete the migration.
4. Advised customer to use bulk endpoints for future large imports (up to 100 records per request).

## Time to Resolution
4 hours (including script rewrite and supervised migration run)

## Lessons Learned
- Bulk import use cases need rate limit documentation and sample throttled scripts.
- Checkpointing is critical for large imports — without it, partial failures require starting over.
- Temporary limit raises for one-time migrations are a legitimate support action with manager approval.
- Bulk endpoints reduce request count by up to 100x — should be recommended proactively.

## Related References
- Runbook: Rate Limiting and Backoff Strategy
- Product Doc: Rate Limiting Policy and Headers
- Log Summary: Rate Limit Exceeded Log Summary
