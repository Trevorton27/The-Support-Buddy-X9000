# SAML Provider Outage (P1)

**Source Type:** INCIDENT_REPORT
**Tags:** saml, sso, okta, authentication, outage, p1, enterprise
**Product Area:** Authentication
**Severity:** high

## Incident Summary
**Severity:** P1
**Duration:** 1 hour 48 minutes
**Impact:** All enterprise customers using SSO were unable to log in. Customers using
email/password authentication were unaffected.

## Timeline
- **11:30 UTC** — Okta service degradation begins (external)
- **11:42 UTC** — Support tickets start arriving: "SSO login not working"
- **11:45 UTC** — Alert fires: SSO authentication failure rate > 20%
- **11:52 UTC** — Confirmed external Okta incident via status.okta.com
- **11:55 UTC** — Incident declared P1. Status page updated.
- **12:10 UTC** — Communicated to affected enterprise customers via email
- **13:18 UTC** — Okta reports incident resolved
- **13:22 UTC** — Verified SSO authentication restored across all tenants. Incident resolved.

## Root Cause
External: Okta experienced a partial outage affecting SAML assertion delivery in the AP and
EU regions. SAML assertions were either not sent or malformed, causing all SP-initiated SSO
flows to fail with assertion validation errors.

Internal: Our system correctly rejected the malformed assertions but the error messaging shown
to end users ("Authentication failed") did not communicate that this was an external provider
issue, causing user confusion and unnecessary support load.

## Impact
- 0 data loss
- ~340 enterprise users unable to log in for 1h 48m
- 27 support tickets opened
- All affected customers notified proactively

## Resolution
External issue resolved by Okta. No changes needed to our systems.

## Prevention Actions
1. Added Okta status page to our external dependency monitoring
2. Improved SSO error messages to distinguish IdP outages from configuration errors
3. Added "fallback to email login" prompt during SSO failures for users who have a password set
4. Runbook created for external IdP outage communication workflow

## Related References
- Runbook: SAML/SSO Configuration Issues
- Support Ticket: SAML Assertion Attribute Mismatch After IdP Update
