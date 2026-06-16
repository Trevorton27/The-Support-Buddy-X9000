# CI/CD Pipeline Failure Runbook

**Source Type:** RUNBOOK
**Tags:** ci-cd, github-actions, pipeline, build, deployment, secrets
**Product Area:** Deployment
**Severity:** medium

## Symptoms
- GitHub Actions workflow failing on push or pull request
- Tests passing locally but failing in CI
- Deployment workflow succeeding but application not updated
- "Secret not found" errors in workflow logs
- Docker build failing only in CI environment
- Test timeouts in CI that don't occur locally

## Possible Causes
1. GitHub Actions secret not set or has wrong name
2. Environment differences between local and CI (Node.js version, OS)
3. Missing `npm ci` (using `npm install` which may behave differently with lockfile)
4. Race condition in parallel test execution
5. Test relying on real external service (database, API) not available in CI
6. Cache invalidation issue — stale dependency cache
7. Workflow YAML syntax error or incorrect step ordering
8. Insufficient permissions for the GitHub Actions token
9. Self-hosted runner offline or misconfigured

## Investigation Steps
1. Review the exact failing step and error message in the Actions tab
2. Check if the workflow uses `npm install` or `npm ci` — prefer `npm ci` in CI for reproducible builds
3. Verify all required secrets are set in GitHub → Settings → Secrets and Variables → Actions
4. Compare Node.js version in workflow (`node-version`) with `.nvmrc` or `package.json` engines
5. Check if tests use database — ensure a test database service is configured in the workflow
6. Look for timing-dependent tests that might fail under CI load
7. Check workflow permissions: `permissions: contents: read, packages: write` etc.
8. Review recent changes to the workflow file itself

## Resolution
- **Missing secret:** Add the secret in GitHub repository settings. Use `${{ secrets.SECRET_NAME }}` syntax — never hardcode values.
- **npm install vs npm ci:** Replace `npm install` with `npm ci` in CI workflows for deterministic installs.
- **Database in tests:** Add a `services` block to the workflow for PostgreSQL: `services: postgres: image: postgres:16`.
- **Node version:** Pin the exact Node.js version: `node-version: '20.x'` or use `.nvmrc` with `node-version-file: '.nvmrc'`.
- **Cache issues:** Clear GitHub Actions cache via Actions → Caches → delete the relevant cache entry.
- **Flaky tests:** Add retry logic for network-dependent tests or mock external dependencies.

## Escalation Criteria
- All workflows across the repository failing simultaneously (GitHub Actions service issue)
- Security secret potentially exposed in workflow logs
- Deployment pipeline blocked for more than 1 hour during business hours
- Production deployment stuck or rolled back unexpectedly

## Related References
- Runbook: Vercel Deployment Failures
- Runbook: Docker Container Startup Failures
- Alert: Deployment Failure Alert
