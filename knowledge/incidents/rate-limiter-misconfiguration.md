# Rate Limiter Misconfiguration Incident (P2)

**Source Type:** INCIDENT_REPORT
**Tags:** rate-limiting, misconfiguration, api, p2, incident
**Product Area:** API
**Severity:** medium

## Incident Summary
**Severity:** P2
**Duration:** 2 hours 15 minutes
**Impact:** Pro plan customers were being rate-limited at the Free plan threshold (10 req/min)
instead of their correct limit (100 req/min). Enterprise customers were unaffected.

## Timeline
- **10:00 UTC** — Deployment of rate limiter config update v1.3.2
- **10:45 UTC** — First support ticket: "Getting 429 errors more than usual"
- **11:00 UTC** — Three more support tickets with same complaint
- **11:08 UTC** — Engineer investigates — confirms Pro plan accounts hitting Free limits
- **11:15 UTC** — Root cause identified: plan lookup cache stale after config deployment
- **11:35 UTC** — Cache cleared and rate limiter restarted with correct plan limits
- **12:15 UTC** — Monitoring confirms Pro accounts receiving correct 100 req/min limit. Resolved.

## Root Cause
The rate limiter service cached customer plan information with a 24-hour TTL. When the rate
limit configuration was updated, the new config was read but the plan lookup was still returning
cached values from before the deployment. A bug in the cache invalidation logic meant plan
upgrades were not being reflected until the TTL expired, causing Pro plan customers to be
treated as Free plan customers.

## Impact
- Pro plan customers incorrectly limited for ~2.5 hours
- 8 Pro customers submitted tickets
- Estimated ~2,000 incorrectly rejected API requests
- No data loss or security impact

## Resolution
Cleared the rate limiter plan lookup cache. Added explicit cache invalidation on deployment.

## Prevention Actions
1. Rate limiter plan cache TTL reduced from 24 hours to 5 minutes
2. Added monitoring for plan-limit mismatch (alert if plan customers hitting free-tier limits)
3. Deployment checklist now includes post-deploy rate limit verification
4. Affected customers issued service credit for the disruption

## Related References
- Runbook: Rate Limiting and Backoff Strategy
- Product Doc: Rate Limiting Policy and Headers
- Alert: High Error Rate Alert
