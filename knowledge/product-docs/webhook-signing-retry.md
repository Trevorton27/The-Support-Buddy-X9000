# Webhook Signing and Retry Behavior

**Source Type:** PRODUCT_DOC
**Tags:** webhook, signing, retry, hmac, delivery, security
**Product Area:** Integrations
**Severity:** medium

## Overview
All webhooks delivered by our platform are signed using HMAC-SHA256 to allow your server to
verify that the payload originated from us and was not tampered with in transit.

## Signature Header
Every webhook request includes the `X-Webhook-Signature` header in the format:
```
X-Webhook-Signature: sha256=<hex-digest>
```

The signature is computed as:
```
HMAC-SHA256(secret=<your_webhook_secret>, message=<raw_request_body>)
```

**Important:** The signature is computed over the raw request body bytes, not a parsed JSON
object. Always validate the signature before parsing the body.

## Verifying Signatures (Node.js Example)
```javascript
const crypto = require('crypto');

function verifyWebhook(rawBody, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
```

## Webhook Secrets and API Key Rotation
**Your webhook signing secret is linked to your API key.** When you rotate your API key,
your webhook signing secret is automatically regenerated. You must update the secret in your
webhook receiver immediately after rotating your API key.

You can find your current webhook signing secret at:
Dashboard → Settings → Integrations → Webhooks → Signing Secret

## Delivery and Retry Behavior
- **Timeout:** Webhook delivery times out after 30 seconds. Return a 2xx response immediately
  and process the payload asynchronously.
- **Retries:** Failed deliveries (non-2xx or timeout) are retried with exponential backoff:
  - Attempt 1: Immediate
  - Attempt 2: 5 minutes
  - Attempt 3: 30 minutes
  - Attempt 4: 2 hours
  - Attempt 5: 5 hours (final)
- **Idempotency:** Each event has a unique `event_id`. Your handler should be idempotent —
  the same event may be delivered more than once in edge cases.
- **Ordering:** Events are not guaranteed to arrive in order. Use the `created_at` timestamp
  in the payload to order events if needed.

## Replaying Failed Deliveries
Failed webhook deliveries can be replayed from:
Dashboard → Settings → Integrations → Webhooks → Delivery Logs → Replay

Replays can be performed for individual events or all failures within a 72-hour window.
