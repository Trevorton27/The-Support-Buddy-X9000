# Webhook Delivery Pipeline Architecture

**Source Type:** ARCHITECTURE_DOC
**Tags:** webhook, queue, delivery, retry, architecture, inngest
**Product Area:** Integrations
**Severity:** medium

## Overview
Webhook delivery is handled asynchronously via a durable queue. Events are never delivered
synchronously inline with the triggering action — this ensures source system reliability is
decoupled from destination endpoint reliability.

## Delivery Flow
```
Application event (e.g. record created)
  → Event emitted to Inngest queue
  → Webhook fan-out function triggered
  → For each registered endpoint:
      → Fetch endpoint config (URL, secret, filters)
      → Filter: does this endpoint subscribe to this event type?
      → Sign payload with HMAC-SHA256
      → HTTP POST to endpoint URL
      → On 2xx: mark delivered, log success
      → On non-2xx or timeout: schedule retry with exponential backoff
      → After 5 failures: mark as permanently failed, stop retrying
```

## Retry Schedule
| Attempt | Delay      |
|---------|------------|
| 1       | Immediate  |
| 2       | 5 minutes  |
| 3       | 30 minutes |
| 4       | 2 hours    |
| 5       | 5 hours    |

After attempt 5 the event is marked `failed` and no further retries are made.
Events remain in the delivery log for 30 days and can be replayed manually.

## Payload Signing
Each delivery is signed:
```
X-Webhook-Signature: sha256=<HMAC-SHA256(secret, rawBody)>
X-Webhook-Event-Id: evt_abc123
X-Webhook-Timestamp: 1720000000
```

The signing secret is derived from the API key. Rotating the API key rotates the secret.

## Queue Health Metrics
- Queue depth (undelivered events)
- Delivery success rate (target: >99.5% over 1h)
- P95 delivery latency
- Permanently failed events per hour

Alerts fire when:
- Queue depth > 500 events
- Delivery success rate < 95% over 5 minutes
- Any single endpoint fails > 10 consecutive deliveries

## Related References
- Product Doc: Webhook Signing and Retry Behavior
- Incident Report: Webhook Queue Delay Incident
- Alert: Webhook Delivery Failure Rate Alert
- Runbook: Webhook Delivery Failures
