# Running Example Operations

> **Purpose:** Hands-on operations guide for triggering and observing every major workflow in the platform — investigations, root-cause analysis, escalations, knowledge base search, and demo resets — through both the UI and direct API calls. Includes a per-ticket scenario matrix so you can target specific agent paths (log analysis, auth runbook retrieval, deployment correlation, incident correlation, GitHub/Jira escalation). Start here when demoing the app or debugging agent behaviour.

**In this article**

- [Prerequisites](#prerequisites)
- [How the Agent Pipeline Works](#how-the-agent-pipeline-works)
- [Operation 1: Run a Full Investigation (UI)](#operation-1-run-a-full-investigation-ui)
- [Operation 2: Run a Full Investigation (API)](#operation-2-run-a-full-investigation-api)
- [Operation 3: Root Cause Analysis — Reading Results](#operation-3-root-cause-analysis--reading-results)
- [Operation 4: Escalation — Internal Note + External Posting](#operation-4-escalation--internal-note--external-posting)
- [Operation 5: Knowledge Base Search (RAG)](#operation-5-knowledge-base-search-rag)
- [Operation 6: Reset and Re-run with Fresh Data](#operation-6-reset-and-re-run-with-fresh-data)
- [Operation 7: Inspect Individual Agent Steps](#operation-7-inspect-individual-agent-steps)
- [Triggering Scenarios by Ticket Type](#triggering-scenarios-by-ticket-type)

---

This guide shows how to trigger and observe the agent pipeline — investigations, root-cause analysis, escalations, and related operations — through both the UI and the API directly.

---

## Prerequisites

All services must be running before any agent work can execute:

```bash
docker compose up -d              # local Postgres + pgvector
npm run db:push                   # apply schema
npm run seed                      # load 7 demo tickets + 10 customers
npm run ingest                    # embed knowledge base into pgvector
npx inngest-cli@latest dev        # Inngest worker (separate terminal)
npm run dev                       # Next.js on http://localhost:3000
```

Sign in at `http://localhost:3000/sign-in` before using the UI or making authenticated API calls.

---

## How the Agent Pipeline Works

Every operation follows the same path:

```
POST /api/agents/run  { ticketId }
  └── creates InvestigationRun (status: pending)
  └── fires Inngest event "investigation/run.requested"
  └── returns { runId } immediately

Inngest worker (background)
  └── intake → customer_context → parallel_analysis → root_cause → response_drafting → escalation
  └── each agent writes an AgentStep to DB as it runs
  └── InvestigationRun status → "complete" when done

UI at /investigations/[runId]
  └── polls every 2s while status = "running"
  └── agent steps appear in timeline as they complete
```

The pipeline always runs all agents in sequence — there is no way to run a subset. The parallel analysis stage runs 4 agents concurrently (log analysis, knowledge retrieval, incident correlation, deployment correlation), then feeds results into root cause, response drafting, and escalation.

---

## Operation 1: Run a Full Investigation (UI)

1. Go to `http://localhost:3000/tickets`
2. Click any ticket row
3. Click **Run Investigation** on the ticket detail page
4. You are redirected to `/investigations/[runId]`
5. Watch the agent timeline populate in real time:
   - **Intake** — classifies category, severity, affected product
   - **Customer Context** — pulls customer record and recent deployments
   - **Log Analysis** — identifies error patterns and anomalies
   - **Knowledge Retrieval** — RAG search against runbooks and product docs
   - **Incident Correlation** — matches related past incidents
   - **Deployment Correlation** — links recent deploys in the time window
   - **Root Cause** — ranks hypotheses with confidence scores
   - **Response Drafting** — writes a customer-facing reply
   - **Escalation** — writes internal escalation note; optionally posts to GitHub/Jira

---

## Operation 2: Run a Full Investigation (API)

First, find a ticket ID from the DB or use a known seeded one:

```bash
# List tickets
curl http://localhost:3000/api/tickets \
  -H "Cookie: <your-session-cookie>"
```

Then trigger an investigation:

```bash
curl -X POST http://localhost:3000/api/agents/run \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{ "ticketId": "<ticket-uuid>" }'
```

Response:

```json
{ "runId": "clxyz..." }
```

Poll for status:

```bash
curl http://localhost:3000/api/investigations/<runId> \
  -H "Cookie: <your-session-cookie>"
```

The response includes `status` (`pending` | `running` | `complete` | `failed`), all `agentSteps`, `hypotheses`, `summary` (customer reply), and `escalationNote`.

---

## Operation 3: Root Cause Analysis — Reading Results

After an investigation completes, the root cause hypotheses are stored on `InvestigationRun.hypotheses`. Each hypothesis has:

| Field | Description |
|---|---|
| `title` | Short label for the hypothesis |
| `description` | Detailed explanation |
| `confidence` | Integer 0–100 |
| `evidence` | Array of supporting signals |
| `recommendation` | Suggested remediation step |

Fetch via API:

```bash
curl http://localhost:3000/api/investigations/<runId> \
  -H "Cookie: <your-session-cookie>"
```

In the UI, hypotheses appear as ranked cards under the agent timeline on `/investigations/[runId]`, sorted by confidence descending.

**Recommended tickets for testing root cause accuracy:**

| Ticket | Expected top hypothesis |
|---|---|
| TKT-001 | DB replica lag in us-east-1 |
| TKT-002 | SAML cert rotation failure for EU region |
| TKT-003 | PgBouncer pool exhaustion after scale-up |
| TKT-004 | Webhook header renamed in v3.1.2 |
| TKT-005 | API key regional propagation delay |
| TKT-006 | Rate limiter burst counter bug |
| TKT-007 | Missing `SECRETS_MANAGER_KEY` in CI action v3.2.0 |

---

## Operation 4: Escalation — Internal Note + External Posting

The escalation agent always runs as the last step of every investigation. It produces a structured internal note saved to `InvestigationRun.escalationNote`.

**Without external integrations configured** — the note is written to the DB only. Visible in the UI under "Escalation Note" and in the API response.

**With GitHub Issues** — set in `.env.local`:

```env
GITHUB_TOKEN=ghp_...
GITHUB_ESCALATION_REPO=your-org/support-escalations
```

The escalation agent will POST a GitHub issue with:
- Title: `[P1/P2] <ticket title>`
- Labels: `escalation`, `<severity>`, `agent-generated`
- Body: full structured escalation JSON

**With Jira** — set in `.env.local`:

```env
JIRA_API_TOKEN=...
JIRA_BASE_URL=https://yourorg.atlassian.net
JIRA_PROJECT_KEY=SUP
```

The escalation agent will POST a Jira issue of type Bug with priority mapped from the severity.

The escalation note JSON structure:

```json
{
  "title": "...",
  "severity": "critical",
  "priority": "P1",
  "summary": "...",
  "rootCause": "...",
  "affectedCustomers": "...",
  "recommendedActions": ["..."],
  "relatedIncidents": ["inc_001"],
  "relatedDeployments": ["deploy_002"]
}
```

After adding or changing these env vars, restart the dev server.

---

## Operation 5: Knowledge Base Search (RAG)

The knowledge agent queries pgvector using the ticket summary as the search query. You can also call the search endpoint directly:

```bash
curl "http://localhost:3000/api/search?q=connection+pool+exhaustion&limit=5" \
  -H "Cookie: <your-session-cookie>"
```

This embeds the query string using `text-embedding-3-small` and returns the top-K chunks from `knowledge-base/` sorted by cosine similarity.

**To add new runbooks:**

1. Drop a `.md` file into `knowledge-base/runbooks/`, `knowledge-base/product-docs/`, or `knowledge-base/internal-notes/`
2. Re-run `npm run ingest` — safe to re-run, upserts by `[sourcePath, chunkIndex]`
3. New content is immediately available to the knowledge agent on next investigation

---

## Operation 6: Reset and Re-run with Fresh Data

To wipe all investigation history and start clean:

```bash
npm run reset
```

This clears all `InvestigationRun` and `AgentStep` records, re-seeds the 7 demo tickets and 10 customers, and re-ingests the knowledge base. Ticket IDs change on each seed so collect fresh IDs after reset.

Alternatively, use the UI: go to `/settings` → **Reset Demo Data**.

---

## Operation 7: Inspect Individual Agent Steps

Each agent writes an `AgentStep` record with its raw input and output JSON. Useful for debugging unexpected hypotheses or responses.

Via API — full step output is included in the investigation response:

```bash
curl http://localhost:3000/api/investigations/<runId> \
  -H "Cookie: <your-session-cookie>" | jq '.agentSteps[] | {agent: .agentName, status: .status, durationMs: .durationMs}'
```

Via UI — click any step in the agent timeline on `/investigations/[runId]` to expand its raw JSON output.

Via Prisma Studio:

```bash
npm run db:studio
```

Navigate to `AgentStep` → filter by `investigationRunId` to see all steps for a run including full `input` and `output` JSON blobs.

---

## Triggering Scenarios by Ticket Type

| Goal | Use Ticket | What to observe |
|---|---|---|
| Test log analysis | TKT-001 | Log agent finds slow query + upstream timeout correlation |
| Test auth/SSO path | TKT-002 | Knowledge agent retrieves auth-token-expiry runbook |
| Test DB runbook retrieval | TKT-003 | Knowledge agent retrieves database-connection-pool runbook |
| Test deployment correlation | TKT-004 | Deploy agent links deploy_004 (v3.1.2 header rename) |
| Test incident correlation | TKT-006 | Incident agent links inc_003 (rate limiter bug) |
| Test escalation to P1 | TKT-001 or TKT-002 | Critical severity → P1 escalation note generated |
| Test GitHub/Jira posting | Any critical ticket | Set integration env vars, run investigation, check external system |
