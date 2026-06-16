# Database Connection Pool Saturation Alert

**Source Type:** ALERT
**Tags:** alert, database, connection-pool, postgresql, monitoring
**Product Area:** Database
**Severity:** critical

## Alert Definition
**Name:** db_connection_pool_saturation
**Threshold:** Active connections > 80% of max_connections for 2 consecutive minutes
**Severity:** P1 if > 95%, P2 if 80–95%
**Channel:** PagerDuty (P1), Slack #alerts (P2)

## What This Alert Means
The database is approaching its connection limit. New connection requests may start failing,
causing application errors for end users. Immediate action is required.

## Immediate Actions
1. Run: `SELECT count(*) FROM pg_stat_activity;` — confirm current connection count
2. Check for long-running idle-in-transaction connections:
   ```sql
   SELECT pid, query, state, query_start, now() - query_start AS duration
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
   ORDER BY duration DESC;
   ```
3. Kill stuck idle-in-transaction connections if present:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
   AND query_start < NOW() - INTERVAL '5 minutes';
   ```
4. Check if a new deployment added more instances without reducing pool size

## Common Causes and Fixes
- **Idle-in-transaction connections:** Kill them immediately; fix the code causing open transactions
- **Too many app instances:** Reduce `connection_limit` in Prisma connection string
- **Not using pooler endpoint:** Switch to Neon pooler endpoint for serverless functions
- **Connection leak:** Check for missing `finally` blocks around database operations

## Escalation
If connections > 95% and cannot be reduced within 10 minutes, the application will start
returning database errors. Consider scaling down app instances to reduce connection demand.

## Related References
- Runbook: Database Connection Pool Exhaustion
- Support Ticket: PostgreSQL Connection Timeout During Peak Traffic
- Product Doc: Database Connection Pooling Guide
