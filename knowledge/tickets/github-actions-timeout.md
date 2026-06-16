# GitHub Actions Build Timeout on Large Monorepo

**Source Type:** SUPPORT_TICKET
**Tags:** github-actions, ci-cd, timeout, monorepo, build, caching
**Product Area:** Deployment
**Severity:** medium

## Ticket Summary
Customer's GitHub Actions workflow was consistently timing out after 60 minutes on their
monorepo build. The workflow installed dependencies, ran type-checking, linting, tests, and
a production build. Locally, the same steps took about 8 minutes. The customer had already
increased the workflow timeout to 60 minutes but it was still not enough.

## Root Cause
Three compounding issues:
1. `npm install` was running instead of `npm ci`, and the cache was not being used correctly —
   every run was doing a full install (~8 minutes).
2. TypeScript `tsc` was running without incremental compilation, rebuilding the entire type
   graph on every run (~20 minutes in a large monorepo).
3. The test suite was running all tests serially when most were independent and could run
   in parallel.

## Resolution Applied
1. Replaced `npm install` with `npm ci` and added proper caching:
   ```yaml
   - uses: actions/setup-node@v4
     with:
       node-version: '20'
       cache: 'npm'
   ```
2. Added `"incremental": true` to `tsconfig.json` and cached `.tsbuildinfo` files between runs.
3. Split the test job into parallel matrix jobs by test suite directory.
4. Total workflow time reduced from 60+ minutes to 11 minutes.

## Time to Resolution
2 hours

## Lessons Learned
- `npm ci` with proper caching is essential in CI — `npm install` is for local development.
- TypeScript incremental builds offer massive speedups in large codebases.
- Parallel test execution requires test isolation — ensure tests don't share state.
- Caching `.tsbuildinfo` between CI runs requires the cache key to include `tsconfig.json` hash.

## Related References
- Runbook: CI/CD Pipeline Failures
- Runbook: Vercel Deployment Failures
