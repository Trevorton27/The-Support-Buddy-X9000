# SAML/SSO Configuration Issues Runbook

**Source Type:** RUNBOOK
**Tags:** saml, sso, authentication, idp, enterprise, okta, azure-ad
**Product Area:** Authentication
**Severity:** high

## Symptoms
- Enterprise users unable to log in via SSO
- "SAML assertion invalid" or "signature verification failed" errors
- Users redirected in a login loop
- Attribute mapping not populating user profile fields
- SSO works in staging but not production
- "InResponseTo mismatch" error

## Possible Causes
1. IdP certificate expired or rotated without updating SP metadata
2. Attribute mapping misconfigured — required fields not included in assertion
3. Clock skew between IdP and SP greater than 5 minutes
4. Wrong ACS URL or Entity ID configured in IdP
5. Assertion encrypted with wrong certificate
6. NameID format mismatch (persistent vs. transient vs. email)
7. SP metadata not updated after IdP migration (Okta → Azure AD, etc.)
8. IdP-initiated SSO attempted when SP-initiated is required

## Investigation Steps
1. Collect the raw SAML response (base64 decode it) — most browser dev tools can capture it
2. Verify the Issuer in the assertion matches the Entity ID configured in the SP settings
3. Check the ACS URL in the assertion matches exactly what's registered
4. Validate the signing certificate — compare thumbprint in IdP with what's in our SP metadata
5. Check assertion timestamps: `IssueInstant`, `NotBefore`, `NotOnOrAfter` — must be within 5 minutes of current time
6. Verify required attributes are present: email (or NameID), firstName, lastName
7. Use `samltool.io` or `samltools.com` to decode and validate the assertion
8. Check if the customer recently migrated IdP providers

## Resolution
- **Expired certificate:** Customer must upload new IdP certificate in our SSO settings → Identity Provider section.
- **Attribute mapping:** Work with customer to map their IdP attributes to our required fields. Common mappings: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` → email.
- **Clock skew:** Advise customer's IT team to synchronize IdP server clock with NTP.
- **Wrong ACS URL:** Provide the exact ACS URL from our dashboard: `https://app.yourdomain.com/auth/saml/callback`
- **NameID format:** Set NameID format to `EmailAddress` in IdP configuration — this is the most compatible option.
- After any configuration change, test with a fresh browser session (incognito) to avoid cached assertions.

## Escalation Criteria
- Customer's entire enterprise org is locked out of the application
- SAML assertion appears valid but authentication still fails (possible SP-side bug)
- Security-sensitive configuration changes required beyond standard attribute mapping
- Customer is using a non-standard IdP (custom SAML implementation)

## Related References
- Support Ticket: SAML Assertion Attribute Mismatch After IdP Update
- Incident Report: SAML Provider Outage
- Product Doc: Organization and Multi-Tenancy Overview
