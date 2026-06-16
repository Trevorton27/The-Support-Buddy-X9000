# SAML Assertion Attribute Mismatch After IdP Update

**Source Type:** SUPPORT_TICKET
**Tags:** saml, sso, okta, attribute-mapping, enterprise, authentication
**Product Area:** Authentication
**Severity:** high

## Ticket Summary
Enterprise customer migrated their Okta tenant from a legacy domain to a new domain as part of
a company rebranding. After the migration, all employees were unable to log in via SSO. The
SAML assertion was being sent correctly, but user profiles were not being created or matched,
resulting in authentication failures.

## Root Cause
The customer's Okta configuration was sending the email attribute under the legacy claim URI
`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`. After their Okta migration,
the email was being sent as a simple `email` attribute name. Our SP expected the legacy URI
format. Additionally, the Okta Entity ID changed when they migrated domains, invalidating the
issuer check.

## Resolution Applied
1. Decoded a sample SAML assertion from the customer (base64 → XML) to identify the new attribute names.
2. Updated the SP-side attribute mapping in the customer's SSO settings:
   - Email: changed from `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` → `email`
   - First name: changed from legacy claim URI → `firstName`
3. Updated the Entity ID in the SP settings to match the new Okta domain.
4. Requested the customer upload the new Okta IdP certificate (domain change rotated it).
5. Tested with a fresh browser session — SSO working within 30 minutes of changes.

## Time to Resolution
3 hours (including waiting for customer to provide SAML assertion sample and new certificate)

## Lessons Learned
- IdP domain migrations always require SP configuration updates — should be a documented checklist.
- SAML debugging is significantly faster with access to the raw assertion. Add instructions to the
  troubleshooting guide for how customers can capture the SAML response from browser dev tools.
- Entity ID changes are a commonly missed step in Okta migrations.

## Related References
- Runbook: SAML/SSO Configuration Issues
- Incident Report: SAML Provider Outage
