# PostgreSQL Connection Timeout During Peak Traffic

**Source Type:** SUPPORT_TICKET
**Tags:** postgresql, connection-pool, timeout, performance, neon, pgbouncer
**Product Area:** Database
**Severity:** critical

## Ticket Summary
Customer reported intermittent "connection timeout" errors during their daily 9am–11am peak
traffic window. The errors were not constant — approximately 5% of requests were failing with
database connection errors. The rest of the application was functioning normally.

## Root Cause
The customer was running 4 application instances on Vercel (serverless functions), each
configured with a Prisma connection pool of 10 connections. During peak traffic, Vercel
was spinning up additional function instances (up to 10 concurrent), resulting in up to
100 simultaneous connection attempts against a Neon Postgres database with a limit of
50 connections. The pooler endpoint was not being used — the customer was connecting to
the direct connection endpoint.

## Resolution Applied
1. Identified Neon connection limit mismatch by checking `pg_stat_activity` during peak.
2. Switched the customer's `DATABASE_URL` from the direct Neon endpoint to the Neon pooler
   endpoint (port 5432 with `-pooler` in the hostname).
3. Reduced Prisma `connection_limit` to 3 via connection string parameter:
   `postgresql://...?connection_limit=3&pool_timeout=10`
4. This brought maximum concurrent connections to ~30 even at peak scaling, well within limits.
5. Confirmed zero connection timeout errors in the subsequent peak window.

## Time to Resolution
5 hours (spanning two peak traffic windows for before/after comparison)

## Lessons Learned
- Neon Postgres has two endpoints: direct and pooler. Serverless applications must use the pooler.
- With serverless functions, pool size should be set low (1–3) because each function instance has
  its own pool and instances scale horizontally.
- `pg_stat_activity` is the fastest way to diagnose connection exhaustion — customer should have
  monitoring on `pg_stat_activity` count.

## Related References
- Runbook: Database Connection Pool Exhaustion
- Alert: Database Connection Pool Saturation Alert
- Product Doc: Database Connection Pooling Guide
- Architecture Doc: Database Architecture and Sharding Strategy
