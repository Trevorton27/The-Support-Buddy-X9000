# High Error Rate Alert (5xx)

**Source Type:** ALERT
**Tags:** alert, 5xx, error-rate, api, monitoring
**Product Area:** API
**Severity:** critical

## Alert Definition
**Name:** high_error_rate_5xx
**Threshold:** 5xx error rate > 1% over 5 minutes
**Severity:** P1 if > 5%, P2 if 1–5%
**Channel:** PagerDuty (P1), Slack #alerts (P2)

## What This Alert Means
A significant portion of API requests are returning server errors. This indicates a platform-level
issue, not a customer configuration problem. Users are likely experiencing failures.

## Immediate Actions
1. Check Vercel deployment status — was there a recent deployment?
2. Check database connectivity — are queries succeeding?
3. Check OpenAI API status if LLM-related errors
4. Review error logs for the most common error message and stack trace
5. Check Inngest function failures if background job errors are involved

## Common Causes and Fixes
- **Recent bad deployment:** Roll back via Vercel Dashboard → Deployments → Promote previous
- **Database connection exhaustion:** See runbook: Database Connection Pool Exhaustion
- **External API (OpenAI) outage:** Errors should be gracefully handled — check error handling code
- **Out of memory:** Check Vercel function memory usage and increase if needed
- **Unhandled promise rejection:** Review logs for the specific stack trace

## Escalation
If error rate > 5% and not resolved within 15 minutes, escalate to engineering lead.
Update status page if customer-visible impact is confirmed.

## Related References
- Runbook: Vercel Deployment Failures
- Runbook: Database Connection Pool Exhaustion
- Incident Report: Rate Limiter Misconfiguration Incident
