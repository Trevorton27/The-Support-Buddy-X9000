# OAuth Refresh Token Expired After Password Reset

**Source Type:** SUPPORT_TICKET
**Tags:** oauth, refresh-token, password-reset, authentication, session
**Product Area:** Authentication
**Severity:** medium

## Ticket Summary
Customer reported that their users were being logged out and forced to re-authenticate after
resetting their passwords. The customer expected password resets to only affect the login
session, not invalidate API OAuth tokens used by their mobile app.

## Root Cause
By design, a password reset invalidates all active OAuth refresh tokens for that user as a
security measure. This prevents previously issued long-lived tokens from remaining valid after
an account security event. The customer's mobile app was storing a refresh token indefinitely
and did not handle the `invalid_grant` error response from the token refresh endpoint.

## Resolution Applied
1. Confirmed the behavior is by design and documented in our security policy.
2. Provided the customer with the correct error handling flow:
   - On `invalid_grant` from token refresh, prompt user to re-authenticate.
   - Do not retry token refresh with the same refresh token after this error.
3. Shared sample code for graceful `invalid_grant` handling in their mobile SDK.
4. Advised implementing a background token refresh before expiry (not reactive on failure) to
   minimize disruption for users who haven't reset their password.

## Time to Resolution
1 hour (documentation and code sample)

## Lessons Learned
- Error handling for `invalid_grant` is commonly omitted in mobile apps — add this to SDK docs.
- The security-driven token invalidation behavior should be more prominent in the password reset
  documentation to set customer expectations.

## Related References
- Runbook: OAuth Token Expiry and Refresh
- Log Summary: OAuth Token Validation Error Log Summary
- Product Doc: API Authentication Overview
