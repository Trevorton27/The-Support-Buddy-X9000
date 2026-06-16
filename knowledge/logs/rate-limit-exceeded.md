# Rate Limit Exceeded Log Summary

**Source Type:** LOG_SUMMARY
**Tags:** rate-limiting, 429, log-analysis, api, throttling
**Product Area:** API
**Severity:** medium

## Log Pattern Description
Rate limit enforcement logs emitted when API keys exceed their request quota.
These logs are used to identify customers hitting limits, diagnose retry storms,
and distinguish legitimate high-volume usage from misconfigured clients.

## Sample Log Entries

### Normal Rate Limit Hit
```
[2024-07-06 14:30:01] INFO rate_limit_exceeded
  api_key_id=key_abc123 org_id=org_xyz plan=pro
  limit=100 window_requests=107 window_start=2024-07-06T14:29:00Z
  endpoint=POST /api/v1/records path_pattern=/api/v1/records
  client_ip=203.0.113.45 retry_after_seconds=23
```

### Retry Storm Pattern
```
[2024-07-06 14:30:01] INFO rate_limit_exceeded api_key_id=key_def456 ... retry_after_seconds=23
[2024-07-06 14:30:01] INFO rate_limit_exceeded api_key_id=key_def456 ... retry_after_seconds=23
[2024-07-06 14:30:01] INFO rate_limit_exceeded api_key_id=key_def456 ... retry_after_seconds=23
[2024-07-06 14:30:02] INFO rate_limit_exceeded api_key_id=key_def456 ... retry_after_seconds=22
[2024-07-06 14:30:02] INFO rate_limit_exceeded api_key_id=key_def456 ... retry_after_seconds=22
```
(Same key, same timestamp, many requests — client is retrying immediately without backoff)

### Wrong Plan Bucket
```
[2024-07-06 15:00:00] WARN rate_limit_plan_mismatch
  api_key_id=key_ghi789 org_id=org_pro plan=pro
  applied_limit=10 expected_limit=100
  reason="cache_stale" cache_age_seconds=86421
```

## Diagnostic Interpretation
- **Single key hitting limits occasionally:** Normal usage spike — advise backoff implementation
- **Same key hammering after 429:** Retry storm — client has no backoff; share backoff code sample
- **Many keys from same org:** Customer may be running parallel processes; consider batch API
- **`plan_mismatch` warning:** Rate limiter cache has stale plan data — clear cache immediately
- **Low `window_requests` relative to limit:** Client is near limit; monitor proactively

## Customer Impact Assessment
Look at `plan` and `org_id` to assess priority:
- Enterprise customers hitting limits → high priority, investigate or temporarily raise limit
- Free plan customers hitting 10 req/min → expected; direct to upgrade
- Pro plan customers hitting limits regularly → discuss batch API or plan upgrade

## Related References
- Runbook: Rate Limiting and Backoff Strategy
- Product Doc: Rate Limiting Policy and Headers
- Support Ticket: Rate Limit Exceeded During Bulk Data Import
- Incident Report: Rate Limiter Misconfiguration Incident
