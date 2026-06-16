# Webhook Delivery Failure Rate Alert

**Source Type:** ALERT
**Tags:** alert, webhook, delivery, failure-rate, monitoring
**Product Area:** Integrations
**Severity:** high

## Alert Definition
**Name:** webhook_delivery_failure_rate
**Threshold:** Webhook delivery failure rate > 5% over 10 minutes, OR queue depth > 500 events
**Severity:** P1 if queue depth > 5000 or failure rate > 20%, P2 otherwise
**Channel:** PagerDuty (P1), Slack #alerts (P2)

## What This Alert Means
Webhook deliveries are failing at an elevated rate. This could be:
- A platform-side issue (delivery system bug, queue processing failure)
- A pattern of customer endpoints becoming unavailable simultaneously
- A single high-volume customer endpoint failing and inflating the overall rate

## Immediate Actions
1. Check if failures are concentrated on a single customer or spread across many
2. Review the specific HTTP error codes being returned (401, 403, 5xx, timeout)
3. Check Inngest function health — is the delivery worker running?
4. Check queue depth trend — is it growing, stable, or shrinking?
5. Verify no recent deployment affected the webhook delivery service

## Distinguishing Platform vs. Customer Issues
- **Many customers, same error type** → Likely platform issue, investigate delivery code
- **One customer, various errors** → Customer endpoint issue, contact them
- **401/403 pattern** → Signing secret mismatch, often follows API key rotation
- **5xx pattern** → Customer server errors
- **Timeout pattern** → Customer endpoints slow or unreachable

## Customer Communication
For P1 webhook delivery incidents affecting many customers:
1. Update status page within 15 minutes of confirming impact
2. Direct-message enterprise customers proactively
3. Once resolved, use "Replay All Failed" to recover missed events

## Related References
- Runbook: Webhook Delivery Failures
- Incident Report: Webhook Queue Delay Incident
- Architecture Doc: Webhook Delivery Pipeline
