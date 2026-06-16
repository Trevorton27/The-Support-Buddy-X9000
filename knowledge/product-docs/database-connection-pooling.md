# Database Connection Pooling Guide

**Source Type:** PRODUCT_DOC
**Tags:** database, connection-pool, postgresql, neon, pgbouncer, serverless
**Product Area:** Database
**Severity:** medium

## Overview
PostgreSQL has a hard limit on concurrent connections (`max_connections`, typically 100 for
smaller instances). Connection pooling is essential for applications that scale horizontally
or use serverless functions.

## Neon Postgres Connection Endpoints
Neon provides two connection endpoints:

**Direct endpoint** (for persistent servers):
```
postgresql://user:pass@ep-name.region.aws.neon.tech/dbname?sslmode=require
```
Use this for: long-running servers, background workers, scripts.

**Pooler endpoint** (for serverless/edge):
```
postgresql://user:pass@ep-name-pooler.region.aws.neon.tech/dbname?sslmode=require
```
Use this for: Vercel functions, AWS Lambda, Next.js API routes, any environment that scales horizontally.

**Always use the pooler endpoint for serverless deployments.**

## Prisma Connection Pool Configuration
With Prisma, configure the connection pool in the connection string:
```
DATABASE_URL="postgresql://...?connection_limit=3&pool_timeout=10"
```

Recommended settings for serverless:
- `connection_limit=3` — Small pool per function instance (3 connections × N instances)
- `pool_timeout=10` — Wait up to 10 seconds for a connection before erroring

Recommended settings for persistent servers:
- `connection_limit=10` — Standard pool size
- `pool_timeout=20`

## Calculating Total Connections
```
Total connections = instances × connection_limit
```
Ensure this is well below `max_connections` with at least 20% headroom:
```
instances × connection_limit < max_connections × 0.8
```

Example: 10 serverless instances × 3 connections = 30 connections (fine for a 100 connection limit)

## Diagnosing Connection Issues
Check current connections in PostgreSQL:
```sql
-- Total active connections
SELECT count(*) FROM pg_stat_activity;

-- Connections by state
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Long-running transactions (holding connections)
SELECT pid, query, state, query_start, now() - query_start AS duration
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Kill an idle connection
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
AND query_start < NOW() - INTERVAL '5 minutes';
```

## Related References
- Runbook: Database Connection Pool Exhaustion
- Support Ticket: PostgreSQL Connection Timeout During Peak Traffic
- Architecture Doc: Database Architecture and Sharding Strategy
