# Database Connection Pool Exhaustion Runbook

**Source Type:** RUNBOOK
**Tags:** database, connection-pool, postgresql, performance, pgbouncer
**Product Area:** Database
**Severity:** critical

## Symptoms
- Application returning "too many connections" or "connection pool exhausted" errors
- Requests timing out with database-related errors
- Slow query times across all endpoints simultaneously
- `pg_stat_activity` shows connections near `max_connections` limit
- Application logs showing "could not obtain connection from pool"
- New deployments failing to start due to connection errors

## Possible Causes
1. Connection pool size configured too large relative to `max_connections`
2. Long-running transactions holding connections open
3. Application not properly releasing connections (missing `finally` block or connection leak)
4. Sudden traffic spike exhausting pre-allocated pool
5. Multiple app instances each with their own large pool
6. ORM misconfigured — creating a new pool per request instead of sharing
7. PgBouncer or connection pooler not configured or bypassed
8. Database failover causing connection storm during reconnect

## Investigation Steps
1. Check current connection count: `SELECT count(*) FROM pg_stat_activity;`
2. Identify long-running transactions: `SELECT pid, query, state, query_start FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;`
3. Check pool configuration in the application: what is `pool_size`, `max_overflow`, `pool_timeout`?
4. Count connections per application server: `SELECT client_addr, count(*) FROM pg_stat_activity GROUP BY client_addr ORDER BY count DESC;`
5. Look for connections in `idle in transaction` state — these are holding transactions open unnecessarily
6. Check if PgBouncer is configured between app and database
7. Review recent deployments — did a new instance get spun up without accounting for its connection pool contribution?

## Resolution
- **Immediate relief:** Kill idle/stuck connections: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND query_start < NOW() - INTERVAL '5 minutes';`
- **Long-term fix:** Reduce pool size per instance or implement PgBouncer in transaction pooling mode.
- **Connection leak:** Review code for missing `finally` blocks around database operations; use ORM connection pool metrics to identify leak source.
- **Multiple instances:** Total connections = instances × pool_size. Ensure `max_connections` ≥ total + 20% headroom.
- **Recommended pool settings for Neon/Postgres:** pool_size=5 per instance, use the Neon pooler endpoint (port 5432 pooled vs 5432 direct).

## Escalation Criteria
- `max_connections` reached and application is completely down
- Long-running transactions cannot be identified or killed
- Connection exhaustion recurring more than once per day
- Database server running out of memory due to connection overhead

## Related References
- Support Ticket: PostgreSQL Connection Timeout During Peak Traffic
- Alert: Database Connection Pool Saturation Alert
- Architecture Doc: Database Architecture and Sharding Strategy
- Log Summary: Database Slow Query Log Summary
