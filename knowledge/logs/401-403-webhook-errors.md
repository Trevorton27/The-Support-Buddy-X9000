# 401/403 Webhook Delivery Error Log Summary

**Source Type:** LOG_SUMMARY
**Tags:** webhook, 401, 403, authentication, signature, log-analysis
**Product Area:** Integrations
**Severity:** high

## Log Pattern Description
This log summary covers webhook delivery attempts returning HTTP 401 (Unauthorized) or
403 (Forbidden) from customer endpoints. These are the most common webhook failure codes
and almost always indicate a signing secret mismatch or firewall/auth configuration issue.

## Sample Log Entries
```
[2024-07-03 14:22:01] WARN webhook_delivery attempt=1 endpoint=https://api.customer.com/hooks/events
  status=401 event_id=evt_01j2abc123 customer_id=cust_xyz duration_ms=312
  response_body={"error":"Invalid signature"}

[2024-07-03 14:27:03] WARN webhook_delivery attempt=2 endpoint=https://api.customer.com/hooks/events
  status=401 event_id=evt_01j2abc123 customer_id=cust_xyz duration_ms=298
  response_body={"error":"Invalid signature"}

[2024-07-03 14:57:03] WARN webhook_delivery attempt=3 endpoint=https://api.customer.com/hooks/events
  status=401 event_id=evt_01j2abc123 customer_id=cust_xyz duration_ms=301
  response_body={"error":"Invalid signature"}
```

## Diagnostic Interpretation
- **401 with "Invalid signature":** Customer endpoint is validating our HMAC signature and rejecting it.
  Most common cause: customer rotated their API key and the webhook secret changed, but their
  receiver still uses the old secret.
- **401 with "Unauthorized" or no body:** Customer endpoint requires additional auth (e.g. bearer
  token, IP allowlist) that our delivery request doesn't include.
- **403 Forbidden:** Customer's server understands the request but actively rejects it.
  Could be IP allowlist (our delivery IPs not included), WAF rule, or auth middleware.
- **Repeated 401 across multiple events for same customer:** Signing secret is definitely wrong.
  Single 401 on a specific event could be a one-time transient issue.

## Recommended Investigation Steps
1. Filter by customer_id to see if 401s are isolated to one customer
2. Check if failures started immediately after an API key rotation event in the audit log
3. Provide customer with their current webhook signing secret from the dashboard
4. Ask customer to log the signature header they're receiving and what they're computing

## Key Fields in These Logs
- `attempt` — Which retry this is (1 = first attempt)
- `status` — HTTP status from customer endpoint
- `event_id` — Use for replay after fix
- `response_body` — Often contains the specific error from the customer's validator

## Related References
- Runbook: Webhook Delivery Failures
- Product Doc: Webhook Signing and Retry Behavior
- Support Ticket: API Key Rotation Broke Webhook Signatures
