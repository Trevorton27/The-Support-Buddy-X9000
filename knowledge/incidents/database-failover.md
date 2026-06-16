# Database Failover Incident (P0)

**Source Type:** INCIDENT_REPORT
**Tags:** database, postgresql, failover, p0, outage, connection-pool
**Product Area:** Database
**Severity:** critical

## Incident Summary
**Severity:** P0
**Duration:** 11 minutes of complete outage, 34 minutes total incident
**Impact:** 100% of write operations failed. Read operations partially degraded.
All customers on the primary region affected.

## Timeline
- **09:14 UTC** — Primary database node goes unresponsive (cause: storage I/O saturation)
- **09:14 UTC** — Alert fires: database latency > 5000ms
- **09:15 UTC** — Automated failover initiates to read replica
- **09:18 UTC** — Read replica promoted to primary
- **09:25 UTC** — Application connection pools begin reconnecting to new primary
- **09:36 UTC** — All application instances reconnected and serving traffic normally
- **09:48 UTC** — Root cause confirmed. Incident resolved.

## Root Cause
The primary database node experienced storage I/O saturation caused by a runaway VACUUM
operation triggered by a large bulk delete job. The VACUUM process consumed 100% of I/O
bandwidth, causing all queries to time out. The automated failover system correctly
detected the unresponsive primary and promoted the standby, but application connection
pools required a forced restart to switch to the new primary endpoint.

## Impact
- 11 minutes of complete write unavailability
- ~3,200 failed API requests during the outage window
- 0 data loss (replica was fully caught up at failover time)
- Automated failover worked correctly but reconnection took longer than expected (7 minutes)

## Resolution
1. Automated failover to standby replica completed in 4 minutes.
2. Application pods restarted to force connection pool reconnection to new primary.
3. Runaway VACUUM job identified and terminated on the new primary.
4. Storage I/O limits tuned: VACUUM throttled with `cost_delay = 20ms`.

## Prevention Actions
1. Added VACUUM monitoring to detect runaway autovacuum before it saturates I/O
2. Added `vacuum_cost_delay` tuning to prevent I/O saturation
3. Application connection pool updated to detect primary switchover and reconnect automatically
4. Bulk delete jobs now scheduled during off-peak hours with rate limiting

## Related References
- Runbook: Database Connection Pool Exhaustion
- Alert: Database Connection Pool Saturation Alert
- Architecture Doc: Database Architecture and Sharding Strategy
