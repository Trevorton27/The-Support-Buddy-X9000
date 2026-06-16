# Organization and Multi-Tenancy Overview

**Source Type:** PRODUCT_DOC
**Tags:** organizations, multi-tenant, clerk, roles, permissions, sso
**Product Area:** Authentication
**Severity:** low

## Overview
Organizations allow multiple users to collaborate within a shared workspace with role-based
access control. Each organization has its own data isolation, billing, and settings.

## Organization Structure
- **Organization** — Top-level tenant. Has its own members, settings, API keys, and data.
- **Members** — Users who belong to the organization with assigned roles.
- **Roles** — `org:admin` (full access) or `org:member` (standard access).

## Creating and Managing Organizations
Users can create an organization during onboarding or via the organization switcher.
Organization settings are accessible at Dashboard → Organization Settings.

**Admin actions:**
- Invite members by email
- Assign or change member roles
- Configure SSO (SAML or OIDC)
- Manage API keys scoped to the organization
- View audit log
- Delete the organization

## SSO Configuration
Enterprise organizations can enforce SSO login for all members:
1. Navigate to Organization Settings → Single Sign-On
2. Choose SAML 2.0 or OIDC
3. Download the SP metadata and configure your IdP
4. Upload the IdP metadata or certificate
5. Test the connection before enforcing SSO

When SSO is enforced, members must log in via the IdP. Email/password login is disabled for
those members. Admin accounts can have a bypass code for IdP outage scenarios.

## Organization Switching
Users who belong to multiple organizations can switch between them using the
`<OrganizationSwitcher />` component. During a switch:
1. The active organization context is updated in the session
2. The `orgId` claim in the JWT is updated (requires a token refresh)
3. The page reloads to reflect the new organization's data

**Middleware note:** During organization switching, there is a brief window where `orgId`
may be null for an authenticated user. Middleware must handle this gracefully — redirect
to an org selection page, not to sign-in.

## Data Isolation
All data is scoped to `orgId`. Queries without an `orgId` filter will not return
cross-organization data. The `orgId` is set from the authenticated session and should
never be taken from user input.

## Related References
- Runbook: Clerk Middleware Misconfiguration
- Support Ticket: Clerk Organization Switch Invalidates Active Session
- Architecture Doc: Authentication and Session Flow
