# Docker Container Startup Failures Runbook

**Source Type:** RUNBOOK
**Tags:** docker, containers, startup, oom, environment-variables, health-check
**Product Area:** Infrastructure
**Severity:** high

## Symptoms
- Container exits immediately after starting (exit code 1 or 137)
- Health check failing — container marked unhealthy and restarted in a loop
- "Cannot allocate memory" in container logs
- Environment variable not found errors on startup
- Port binding conflicts preventing container start
- Database connection failure during application startup
- Container starts but application crashes after a few seconds

## Possible Causes
1. Missing required environment variables not passed to container
2. Out of memory — container memory limit too low for the application
3. Application crash on startup due to failed database connection
4. Port already in use on the host
5. Wrong entrypoint or CMD in Dockerfile
6. Base image mismatch — wrong Node.js version
7. `node_modules` not present in image (missing `RUN npm install` in Dockerfile)
8. Prisma client not generated in the image (missing `RUN npm run db:generate`)
9. Health check endpoint not responding within timeout

## Investigation Steps
1. Check container exit code: `docker inspect <container_id> --format='{{.State.ExitCode}}'`
2. Review container logs: `docker logs <container_id> --tail=100`
3. Check if the container is OOM killed (exit code 137): `docker inspect <container_id> | grep OOMKilled`
4. Verify all required environment variables: `docker exec <container_id> env | grep -E 'DATABASE_URL|API_KEY'`
5. Test startup manually: `docker run --rm -it <image> sh` then run the startup command manually
6. Check available memory: `docker stats <container_id>`
7. Verify the Dockerfile has correct build steps in order
8. Confirm database is reachable from the container network

## Resolution
- **Missing env vars:** Pass them with `--env-file .env` or `-e KEY=VALUE` in the run command, or update the compose file.
- **OOM:** Increase container memory limit in `docker-compose.yml` or ECS task definition. Minimum 512MB for Next.js, 1GB recommended.
- **Database connection:** Ensure the database URL uses the correct hostname (container name in compose networks, not `localhost`).
- **Prisma not generated:** Add `RUN npx prisma generate` to Dockerfile after `npm install`.
- **Port conflict:** Change the host port mapping: `-p 3001:3000` instead of `-p 3000:3000`.
- **Health check:** Ensure the health check endpoint responds before the timeout. Add `HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:3000/api/health || exit 1`.

## Escalation Criteria
- Container repeatedly crashing in production ECS/Kubernetes (auto-restart loop)
- OOM kills happening at healthy traffic levels (requires infrastructure resize)
- Container image build failing in CI/CD pipeline
- Security vulnerability in base image requiring emergency rebuild

## Related References
- Alert: Deployment Failure Alert
- Architecture Doc: Deployment Pipeline and Infrastructure Overview
- Log Summary: Vercel Build Error Log Summary
