# OAuth Token Validation Error Log Summary

**Source Type:** LOG_SUMMARY
**Tags:** oauth, tokens, authentication, invalid-grant, log-analysis
**Product Area:** Authentication
**Severity:** medium

## Log Pattern Description
Token validation and refresh errors captured at the OAuth token endpoint. These logs help
distinguish between expired tokens, revoked tokens, invalid client credentials, and
implementation errors in customer OAuth clients.

## Sample Log Entries
```
[2024-07-05 11:03:22] WARN oauth_token_error error=invalid_grant
  grant_type=refresh_token client_id=oauth_client_abc
  reason="refresh_token_expired" token_age_days=32

[2024-07-05 11:03:45] WARN oauth_token_error error=invalid_grant
  grant_type=refresh_token client_id=oauth_client_abc
  reason="refresh_token_already_used" issued_at=2024-07-05T11:02:18Z

[2024-07-05 11:08:01] WARN oauth_token_error error=invalid_client
  grant_type=client_credentials client_id=oauth_client_xyz
  reason="client_secret_mismatch"

[2024-07-05 11:15:33] INFO oauth_token_revoked
  reason="password_reset" user_id=usr_pqr789 tokens_revoked=3
```

## Diagnostic Interpretation
- **`invalid_grant` + `refresh_token_expired`:** Refresh token is older than 30 days.
  User must re-authenticate. This is expected behavior, not a bug.
- **`invalid_grant` + `refresh_token_already_used`:** Token rotation conflict — the same
  refresh token was used twice. Usually indicates a race condition in the customer's app
  where two threads tried to refresh simultaneously. Only the first succeeds; the second
  gets this error.
- **`invalid_client`:** Client credentials are wrong. Customer's OAuth app secret is
  incorrect or has been rotated.
- **`oauth_token_revoked` + `reason=password_reset`:** Security event — expected. All
  tokens for a user are invalidated when they reset their password.

## Patterns That Indicate Issues
- Same client ID generating `refresh_token_already_used` repeatedly → race condition bug
- Many `invalid_grant` errors for recently created tokens → possible clock skew issue
- `invalid_client` errors on previously working clients → secret may have been rotated

## Recommended Customer Guidance
For `invalid_grant` + `refresh_token_already_used`:
> Implement a mutex or lock around your token refresh logic. If multiple concurrent requests
> trigger a refresh, only one should actually call the refresh endpoint — others should wait
> and reuse the new token from the first successful refresh.

## Related References
- Runbook: OAuth Token Expiry and Refresh
- Support Ticket: OAuth Refresh Token Expired After Password Reset
- Product Doc: API Authentication Overview
