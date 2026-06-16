# Webhook Queue Delay Incident (P1)

**Source Type:** INCIDENT_REPORT
**Tags:** webhook, queue, delivery, incident, p1
**Product Area:** Integrations
**Severity:** high

## Incident Summary
**Severity:** P1
**Duration:** 3 hours 22 minutes
**Impact:** 100% of webhook deliveries delayed by 45–90 minutes. Approximately 18,000 events
queued. All customers using webhooks affected.

## Timeline
- **14:02 UTC** — Deployment of webhook processing service v2.4.1
- **14:08 UTC** — Alert fires: webhook delivery failure rate > 5%
- **14:15 UTC** — On-call engineer begins investigation
- **14:31 UTC** — Identified: new deployment introduced a retry loop consuming all worker threads
- **14:45 UTC** — Decision to roll back to v2.4.0
- **15:03 UTC** — Rollback complete. Queue processing begins draining
- **17:24 UTC** — Queue fully drained, all delayed events delivered. Incident resolved.

## Root Cause
A code change in v2.4.1 modified the retry logic for failed webhook deliveries. A bug in the
new logic caused events that failed with a 5xx response to be immediately re-queued at the
front of the queue rather than with exponential backoff at the back. This caused a small
number of failing endpoints to generate thousands of retries, consuming all worker threads and
starving the queue of normal deliveries.

## Impact
- 18,247 webhook events delayed (not lost)
- 0 events permanently lost
- 142 customers affected
- 3 enterprise customers opened support tickets
- Estimated business impact: medium (integrations delayed, no data loss)

## Resolution
Rolled back to v2.4.0. Queue drained over 2.5 hours using increased worker concurrency (10 → 25)
to accelerate recovery.

## Prevention Actions
1. Added retry queue depth as a primary alert metric (alert at >500 queued)
2. Added circuit breaker: endpoints failing >10 consecutive times go to a slow-retry lane
3. Load testing for retry storms added to deployment checklist
4. v2.4.1 fixed and re-tested — re-deployed 5 days later without issue

## Related References
- Runbook: Webhook Delivery Failures
- Alert: Webhook Delivery Failure Rate Alert
- Product Doc: Webhook Signing and Retry Behavior
