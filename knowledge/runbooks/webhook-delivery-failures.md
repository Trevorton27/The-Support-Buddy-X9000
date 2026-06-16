# Webhook Delivery Troubleshooting Runbook

**Source Type:** RUNBOOK
**Tags:** webhook, delivery, retry, signatures, authentication
**Product Area:** Integrations
**Severity:** high

## Symptoms
- Customers report webhooks not being received
- Webhook delivery status shows repeated failures in dashboard
- HTTP 401, 403, or 5xx responses from customer endpoints
- Webhook events queuing up without delivery
- Customer reports duplicate webhook deliveries

## Possible Causes
1. Invalid or rotated webhook signing secret on customer side
2. Customer endpoint returning non-2xx response
3. Customer endpoint timeout (>30 seconds)
4. Firewall or IP allowlist blocking delivery attempts
5. TLS certificate issues on customer endpoint
6. Webhook secret mismatch after API key rotation
7. Customer endpoint not validating signature correctly

## Investigation Steps
1. Check webhook delivery logs in the admin dashboard for the customer's endpoint URL
2. Review HTTP response codes — distinguish 4xx (customer config) from 5xx (customer server) from timeout
3. Verify the webhook signing secret in the customer's integration settings matches what they have configured
4. Test connectivity to the customer endpoint: `curl -I https://customer-endpoint.com/webhook`
5. Check if the customer recently rotated API keys (common cause of signature validation failures)
6. Review the signature validation logic — we sign with HMAC-SHA256 using the `X-Webhook-Signature` header
7. Check the retry queue status — are retries exhausted or still pending?
8. Confirm the customer endpoint responds within 30 seconds (our delivery timeout)

## Resolution
- **401/403 errors:** Customer webhook signing secret is wrong — ask them to update it in their integration settings to match the value shown in the dashboard. Provide the current secret.
- **5xx errors:** Customer server is erroring — share the response body from our logs so they can debug their handler.
- **Timeout:** Customer endpoint is too slow — advise them to return 200 immediately and process asynchronously.
- **IP block:** Provide our static webhook delivery IP ranges for their allowlist.
- **TLS errors:** Customer certificate is expired or invalid — they need to renew it.
- After fixing the root cause, use the "Replay failed webhooks" button in the admin dashboard to retry all failed deliveries from the past 72 hours.

## Escalation Criteria
- Delivery failures affecting more than 10 customers simultaneously (possible platform issue)
- Webhook queue depth exceeds 10,000 undelivered events
- Failures persist after customer confirms secret is correct (possible signing bug)
- Customer is enterprise tier and SLA breach is imminent

## Related References
- Product Doc: Webhook Signing and Retry Behavior
- Incident Report: Webhook Queue Delay Incident (P1)
- Alert: Webhook Delivery Failure Rate Alert
