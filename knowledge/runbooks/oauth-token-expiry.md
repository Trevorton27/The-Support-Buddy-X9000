# OAuth Token Expiry and Refresh Runbook

**Source Type:** RUNBOOK
**Tags:** oauth, tokens, refresh, authentication, session
**Product Area:** Authentication
**Severity:** medium

## Symptoms
- Customer reports users being logged out unexpectedly
- API calls returning 401 after a period of activity
- "Token expired" or "invalid_grant" errors in logs
- Refresh token rotation not working as expected
- Users losing session state mid-workflow

## Possible Causes
1. Access token expired and refresh token not being used correctly
2. Refresh token itself has expired (typically 30–90 days)
3. Refresh token invalidated by password change or security event
4. Multiple concurrent refresh requests causing race condition (only one succeeds)
5. Clock skew between client and server causing premature expiry detection
6. PKCE code challenge mismatch in authorization code flow
7. Redirect URI mismatch between registration and request

## Investigation Steps
1. Check the error response body — `invalid_grant` means expired/revoked token; `invalid_client` means wrong credentials
2. Review the token introspection endpoint to confirm token status
3. Check the customer's token storage — are they persisting refresh tokens across app restarts?
4. Review the refresh token rotation policy — we issue a new refresh token on each use; old ones are immediately invalidated
5. Check for concurrent refresh requests — if customer's app is making multiple parallel API calls that all trigger refresh, they may be hitting a race condition
6. Verify the customer's OAuth app redirect URI matches exactly (including trailing slashes)
7. Check if the user recently changed their password (this invalidates all refresh tokens for that user)

## Resolution
- **Expired refresh token:** User must re-authenticate. Advise customer to implement proactive token refresh (refresh 60 seconds before expiry, not after failure).
- **Race condition:** Implement a token refresh mutex — only one refresh at a time, others wait for the result.
- **Password reset invalidation:** Expected behavior — user must log in again after password change.
- **Clock skew:** Advise customer to synchronize server clocks with NTP; add a 30-second buffer to expiry checks.
- **Redirect URI mismatch:** Customer must update their OAuth app registration to include the exact URI being used.
- Provide the customer with sample refresh token handling code if they need it.

## Escalation Criteria
- Refresh tokens expiring faster than the configured expiry window (possible bug)
- Token refresh endpoint returning 5xx errors
- Multiple customers affected simultaneously (possible platform-wide token service issue)
- Security-sensitive context (payment processing, healthcare data)

## Related References
- Support Ticket: OAuth Refresh Token Expired After Password Reset
- Log Summary: OAuth Token Validation Error Log Summary
- Product Doc: API Authentication Overview
