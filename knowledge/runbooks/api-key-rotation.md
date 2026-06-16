# API Key Rotation Runbook

**Source Type:** RUNBOOK
**Tags:** api-keys, rotation, authentication, secrets, webhooks
**Product Area:** Authentication
**Severity:** high

## Symptoms
- Customer reports sudden authentication failures after rotating API keys
- Webhook signatures failing immediately after key rotation
- SDK calls returning 401 Unauthorized
- Integrations (Slack, Zapier, third-party) stop working
- Multiple services failing simultaneously

## Possible Causes
1. Customer updated the key in one place but not all integrations
2. Old key cached in application memory or CI/CD secrets
3. Webhook signing secret not updated alongside API key
4. Key rotation propagation delay (can take up to 5 minutes)
5. Key used in environment variable not redeployed after rotation
6. Customer rotated wrong key (test vs. production)

## Investigation Steps
1. Confirm which key was rotated — check the audit log for the rotation event timestamp
2. Ask the customer: "Which services stopped working and when did you rotate the key?"
3. Verify the new key is correctly set in all integration points:
   - Application environment variables
   - CI/CD pipeline secrets (GitHub Actions, Vercel, etc.)
   - Third-party integrations (Zapier, Make, etc.)
   - Webhook signing secrets (separate from API key)
4. Check if the old key is still active — we provide a 24-hour grace period before deactivation
5. Confirm the environment the customer is experiencing issues in (test vs. production)
6. If using Vercel, confirm they redeployed after updating the env var — Vercel does not hot-reload env changes

## Resolution
- **Missing redeployment:** If customer is on Vercel/similar, instruct them to trigger a redeployment after updating the env var.
- **Webhook secret not updated:** Guide them to Settings → Integrations → Webhooks → update the signing secret. This is separate from the API key.
- **Cached key:** Instruct customer to restart their application processes or clear the key from in-memory caches.
- **Grace period:** If the old key is still within the 24-hour window, confirm the new key works first, then let the old one expire naturally.
- **Multiple integrations:** Provide the customer with a checklist of all places the key needs to be updated.

## Escalation Criteria
- Customer reports key rotation broke a production payment flow
- Grace period has passed but old key requests are still being accepted (possible deactivation bug)
- Customer claims they did not rotate the key but it stopped working (possible security incident)
- Enterprise customer with active SLA escalation

## Related References
- Support Ticket: API Key Rotation Broke Webhook Signatures
- Product Doc: API Authentication Overview
- Runbook: Webhook Delivery Failures
