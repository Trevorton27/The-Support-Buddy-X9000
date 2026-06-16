# Docker Container OOM Crash in Production

**Source Type:** SUPPORT_TICKET
**Tags:** docker, oom, memory, containers, production, ecs
**Product Area:** Infrastructure
**Severity:** critical

## Ticket Summary
Customer's production application began crashing intermittently with no error logs. The
container would abruptly stop and restart. The pattern was consistent — crashes always
occurred under high traffic, around 2–3 hours after deployment. The application was running
on AWS ECS with a 512MB memory limit per task.

## Root Cause
The Node.js process was running without a V8 heap size limit. By default, Node.js attempts
to use as much memory as available. The application was loading large JSON payloads into
memory for processing and was not streaming or paginating the results. After 2–3 hours,
enough requests had accumulated memory that V8 heap usage exceeded the 512MB ECS task
limit, triggering an OOM kill (exit code 137).

## Resolution Applied
1. Confirmed OOM kill by checking ECS task stop reason: "Task failed ECS resource limits" and
   exit code 137 in CloudWatch logs.
2. Added `NODE_OPTIONS=--max-old-space-size=400` to the container environment (400MB heap,
   leaving 112MB for system overhead within the 512MB limit).
3. Increased the ECS task memory limit from 512MB to 1024MB to provide proper headroom.
4. Identified the specific endpoint loading full result sets into memory — added pagination
   (limit 100 records per page) to prevent unbounded memory usage.
5. Added a `/api/health` endpoint returning memory stats for monitoring.

## Time to Resolution
6 hours (including identifying the root cause endpoint and deploying the fix)

## Lessons Learned
- Always set `--max-old-space-size` in Node.js containers to prevent unbounded heap growth.
- OOM kills leave no application-level logs — CloudWatch container insights is needed to
  diagnose them.
- Endpoints returning large datasets without pagination are a memory bomb under load.
- 512MB is too small for a Next.js production server — minimum 1GB is recommended.

## Related References
- Runbook: Docker Container Startup Failures
- Alert: Deployment Failure Alert
- Architecture Doc: Deployment Pipeline and Infrastructure Overview
