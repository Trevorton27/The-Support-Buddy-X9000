# Database Slow Query Log Summary

**Source Type:** LOG_SUMMARY
**Tags:** database, postgresql, slow-queries, performance, indexes, log-analysis
**Product Area:** Database
**Severity:** high

## Log Pattern Description
Slow query logs captured when query execution time exceeds 1000ms. These logs are the
primary tool for diagnosing database performance degradation and identifying missing indexes.

## Sample Log Entries
```
[2024-07-04 09:15:33] WARN slow_query duration_ms=4821 query="SELECT t.*, c.* FROM \"Ticket\" t
  JOIN \"Customer\" c ON t.\"customerId\" = c.id WHERE t.\"orgId\" = $1
  ORDER BY t.\"createdAt\" DESC LIMIT 50"
  params=["org_abc123"] rows_returned=50

[2024-07-04 09:15:41] WARN slow_query duration_ms=8934 query="SELECT * FROM \"InvestigationRun\"
  WHERE \"ticketId\" = ANY($1) AND status = 'complete'"
  params=[["tkt_001","tkt_002",...]] rows_returned=127

[2024-07-04 09:22:11] WARN slow_query duration_ms=12043 query="SELECT kc.*, 1 - (embedding <=>
  $1::vector) AS similarity FROM \"KnowledgeChunk\" WHERE embedding IS NOT NULL
  ORDER BY embedding <=> $1::vector LIMIT 15"
  rows_returned=15
```

## Diagnostic Interpretation
- **Query 1 (4.8s):** JOIN across Ticket and Customer with ORDER BY createdAt — missing composite
  index on `(orgId, createdAt)`. The query must scan all tickets for the org before sorting.
- **Query 2 (8.9s):** `ANY($1)` with a large array can be slow — consider a JOIN instead.
  Also check if `ticketId` has an index.
- **Query 3 (12s):** pgvector similarity search without an IVFFlat or HNSW index. Vector searches
  on large tables require approximate nearest neighbor indexing.

## Common Fixes
- **Missing index:** `CREATE INDEX CONCURRENTLY idx_ticket_org_created ON "Ticket" ("orgId", "createdAt" DESC);`
- **pgvector no index:** Create an HNSW index: `CREATE INDEX ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);`
- **N+1 queries:** Combine multiple single-row queries into one batch query or use Prisma `include`
- **ANY with large array:** Convert to `JOIN` with a temp table or VALUES list

## Using EXPLAIN ANALYZE
Always run `EXPLAIN ANALYZE` on slow queries to see the execution plan:
```sql
EXPLAIN ANALYZE SELECT t.*, c.*
FROM "Ticket" t JOIN "Customer" c ON t."customerId" = c.id
WHERE t."orgId" = 'org_abc123'
ORDER BY t."createdAt" DESC LIMIT 50;
```
Look for `Seq Scan` — these indicate missing indexes.

## Related References
- Runbook: Database Connection Pool Exhaustion
- Product Doc: Database Connection Pooling Guide
- Alert: API Latency Spike Alert
