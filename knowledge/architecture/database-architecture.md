# Database Architecture and Sharding Strategy

**Source Type:** ARCHITECTURE_DOC
**Tags:** database, postgresql, neon, sharding, replication, architecture
**Product Area:** Database
**Severity:** low

## Overview
Primary data store is PostgreSQL hosted on Neon (serverless Postgres). pgvector extension
is enabled for vector similarity search on knowledge base embeddings.

## Connection Architecture
```
Application (Vercel Serverless Functions)
  → Neon Pooler Endpoint (PgBouncer, transaction mode)
  → Primary PostgreSQL Node
  → Read Replica (for read-heavy queries)
```

Persistent background workers (Inngest) connect to the direct endpoint to avoid
PgBouncer transaction pooling limitations with prepared statements.

## Key Configuration
- `max_connections`: 100 (Neon free tier), 300 (pro tier)
- Pooler mode: Transaction pooling (connection released after each transaction)
- Connection limit per app instance: 3 (serverless), 10 (persistent)
- SSL: Required (`sslmode=require`)
- pgvector: Enabled via `CREATE EXTENSION IF NOT EXISTS vector`

## Data Organization
All multi-tenant data is scoped by `orgId`. Every table with customer-facing data includes
an `orgId` column with a database index.

```sql
-- Example: all queries scoped by orgId
SELECT * FROM "Ticket" WHERE "orgId" = $1 ORDER BY "createdAt" DESC;
```

## Failover
Neon manages automatic failover with a standby replica in the same region.
Typical failover time: 30–60 seconds. Application connection pools detect the failover
via connection errors and reconnect automatically (Prisma handles this).

## Migrations
- Development: `prisma db push` (schema drift, no migration file)
- Production: `prisma migrate deploy` (versioned migration files)
- All migrations are backward compatible — no destructive changes to running systems
- pgvector operations use raw SQL (`$queryRaw` / `$executeRaw`) — not managed by Prisma migrations

## Backup and Recovery
- Neon provides automatic continuous backup (point-in-time recovery up to 7 days)
- Branch feature used for staging environments (zero-copy branch from production data)
- Recovery objective: RPO < 1 minute, RTO < 15 minutes

## Related References
- Product Doc: Database Connection Pooling Guide
- Runbook: Database Connection Pool Exhaustion
- Incident Report: Database Failover Incident
