# Vercel Edge Network Degradation (P1)

**Source Type:** INCIDENT_REPORT
**Tags:** vercel, edge, deployment, latency, p1, cdn
**Product Area:** Deployment
**Severity:** high

## Incident Summary
**Severity:** P1
**Duration:** 52 minutes
**Impact:** API response times increased 300–500% for customers in the EU-West region.
Application remained functional but significantly degraded. Approximately 15% of requests
timed out from EU client locations.

## Timeline
- **16:00 UTC** — Vercel deploys edge network configuration change
- **16:07 UTC** — Alert fires: p99 API latency > 8000ms (EU region)
- **16:12 UTC** — Identified EU-specific degradation via regional latency monitoring
- **16:18 UTC** — Confirmed Vercel edge degradation via vercel.com/incidents
- **16:20 UTC** — Status page updated: "Investigating EU latency degradation"
- **16:35 UTC** — Workaround explored: temporarily routing EU traffic via US-East edge (decided against due to latency increase)
- **16:52 UTC** — Vercel resolves edge issue
- **16:56 UTC** — EU latency returns to baseline. Incident resolved.

## Root Cause
External: Vercel edge network configuration change caused routing inefficiencies in the
EU-West-1 PoP, significantly increasing cold start times and request routing overhead for
serverless functions serving that region.

## Impact
- 0 data loss
- ~8,400 requests experienced >3x latency increase
- ~1,200 requests timed out
- EU-based customers most affected
- No permanent failures — all data operations completed eventually

## Resolution
Resolved by Vercel. No code changes required.

## Prevention Actions
1. Added regional latency alerts (separate thresholds for EU and US)
2. Explored multi-cloud redundancy for EU traffic (deprioritized due to cost)
3. Added Vercel incident feed to our monitoring dashboard
4. Identified 3 API endpoints with no client-side timeout — added 30-second timeouts

## Related References
- Runbook: Vercel Deployment Failures
- Alert: Deployment Failure Alert
- Architecture Doc: Deployment Pipeline and Infrastructure Overview
