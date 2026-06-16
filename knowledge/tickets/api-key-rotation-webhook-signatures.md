# API Key Rotation Broke Webhook Signatures

**Source Type:** SUPPORT_TICKET
**Tags:** api-keys, webhook, signatures, authentication, rotation
**Product Area:** Integrations
**Severity:** high

## Ticket Summary
Customer rotated their production API key via the dashboard. Within minutes, their webhook receiver
began rejecting all incoming events with signature validation errors. The customer confirmed their
endpoint was computing the HMAC-SHA256 signature using the old key.

## Root Cause
The webhook signing secret is derived from the API key at the time of webhook endpoint creation.
When the customer rotated their API key, the webhook signing secret was automatically regenerated
to match. The customer's webhook receiver was still using the old signing secret hardcoded in
their environment variables, causing all signature checks to fail.

## Resolution Applied
1. Identified the new webhook signing secret in the customer's dashboard under Integrations → Webhooks.
2. Instructed customer to update the `WEBHOOK_SECRET` environment variable in their application.
3. Customer was on Vercel — reminded them to trigger a redeployment after updating the env var.
4. Used the "Replay failed webhooks" feature to re-deliver the 47 missed events from the past hour.
5. Verified delivery success after redeployment.

## Time to Resolution
2.5 hours (including customer redeployment and verification)

## Lessons Learned
- When rotating API keys, the webhook signing secret changes automatically — this is not clearly
  communicated in the dashboard. A warning should be added to the key rotation flow.
- Customers should be advised to update webhook secrets in all environments simultaneously.
- The "Replay failed webhooks" feature was essential for recovering missed events.

## Related References
- Runbook: API Key Rotation
- Runbook: Webhook Delivery Failures
- Product Doc: Webhook Signing and Retry Behavior
