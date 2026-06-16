# API Latency Spike Alert

**Source Type:** ALERT
**Tags:** alert, latency, performance, api, monitoring, p95
**Product Area:** API
**Severity:** high

## Alert Definition
**Name:** api_latency_spike
**Threshold:** p95 API response time > 3000ms over 5 minutes (baseline: ~200ms)
**Severity:** P1 if p99 > 10000ms, P2 if p95 > 3000ms
**Channel:** PagerDuty (P1), Slack #alerts (P2)

## What This Alert Means
API response times have significantly increased. Users may experience slow page loads,
timeouts, or degraded functionality. This is distinct from error rate — requests are
succeeding but slowly.

## Immediate Actions
1. Identify which endpoints have the highest latency (check per-route metrics)
2. Check if latency is global or regional (use regional latency dashboard)
3. Check database query times — slow queries are the most common cause
4. Check LLM API response times if AI features are affected
5. Look for `SELECT` queries without indexes on recently added columns
6. Check for N+1 query patterns introduced in recent deployments

## Common Causes and Fixes
- **Slow database query:** Use `EXPLAIN ANALYZE` to identify; add index or optimize query
- **Missing index on new column:** `CREATE INDEX CONCURRENTLY` to add without blocking
- **LLM API slow:** Check OpenAI status page; implement timeout and graceful degradation
- **Vercel cold starts:** Edge functions have cold starts — consider Edge Runtime for latency-sensitive routes
- **External API slow:** Identify which external call is blocking; add timeout and async processing
- **N+1 queries:** Use Prisma's `include` to batch-load related records

## Database Slow Query Investigation
```sql
-- Find slow queries (pg_stat_statements required)
SELECT query, mean_exec_time, calls, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

## Escalation
If p99 latency > 10 seconds and not resolving within 20 minutes, escalate.
Users are likely experiencing timeouts.

## Related References
- Runbook: Database Connection Pool Exhaustion
- Alert: High Error Rate Alert
- Log Summary: Database Slow Query Log Summary
