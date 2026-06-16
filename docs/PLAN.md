# AI Support Operations Platform — Implementation Plan

> **Purpose:** The original greenfield implementation plan written before development began. Describes all required third-party services (Clerk, OpenAI, Neon, Inngest, LangGraph), the 15-step build order, a file-by-file explanation of every module, the Inngest function architecture, and the full agent workflow data flow. Serves as the definitive design reference for the core system — cross-reference with `CHANGELOG.md` in this folder to see how the plan evolved during implementation.

## Context

This is a greenfield multi-agent dashboard for AI-powered support ticket investigation. A user submits a ticket; a LangGraph-based agent pipeline (Intake → Customer Context → parallel Log/Knowledge/Incident/Deployment agents → Root Cause → Response → Escalation) runs automatically, produces root-cause hypotheses, a drafted customer reply, and an internal escalation note. The goal is a portfolio-grade app demonstrating multi-agent orchestration, RAG, streaming UI, and real-world observability patterns.

---

## 3rd-Party Services & APIs Required

### Core / Required
| Service | Purpose | Package |
|---|---|---|
| **Clerk** | Auth (sign-in, sign-up, session, middleware) | `@clerk/nextjs` |
| **OpenAI** | LLM for all agents + text-embedding-3-small for RAG | `openai` |
| **Neon (Postgres + pgvector)** | Primary database + vector search for RAG | `@neondatabase/serverless` via Prisma |
| **Prisma** | ORM + migrations | `prisma`, `@prisma/client` |
| **Inngest** | Durable background jobs for agent runs (retries, fan-out) | `inngest` |
| **LangGraph.js** | Agent graph orchestration | `@langchain/langgraph` |

### Optional / Post-MVP
| Service | Purpose |
|---|---|
| **Anthropic Claude API** | Alternate LLM (selectable in settings) |
| **GitHub Issues API** | Real ticket source (OAuth token required) |
| **Sentry API** | Real error events (DSN + API token) |
| **Jira Cloud REST API** | Real escalation target (OAuth 2.0) |

### Local Dev
| Tool | Purpose |
|---|---|
| **Docker Compose** | Local Postgres + pgvector |
| **Vercel CLI** | Environment variable sync, preview deploys |

---

## Implementation Order

1. Scaffold Next.js 15 + Tailwind + shadcn/ui + Clerk
2. Prisma schema + Docker Compose local DB
3. Seed scripts + dummy JSON data
4. Ticket dashboard + list page (static data)
5. Ticket detail page + investigation panel (static output)
6. Inngest function wiring + `POST /api/agents/run`
7. Intake agent (LangGraph node, real LLM)
8. Customer context, log analysis, knowledge retrieval agents
9. pgvector RAG — ingest markdown knowledge base
10. Parallel agent fan-out (LangGraph)
11. Root cause + response + escalation agents
12. Streaming agent timeline (Server-Sent Events or Vercel AI SDK `streamText`)
13. `/investigations/[runId]` full trace view
14. Settings page (model selection, demo reset)
15. Optional: GitHub / Sentry / Jira integrations

---

## File-by-File Explanation

### `app/` — Next.js App Router Pages

#### `app/layout.tsx`
Root layout. Wraps app in `<ClerkProvider>`. Imports global Tailwind CSS. Sets metadata.

#### `app/page.tsx`
Public landing / redirect. Unauthenticated users see a marketing splash or are redirected to `/dashboard` if signed in. Uses `auth()` from Clerk to check session.

#### `app/dashboard/page.tsx`
Protected. Server Component. Fetches KPI summary (open tickets count, avg resolution time, active investigations) via direct Prisma calls. Renders `<KpiCards>` and `<RecentInvestigations>`.

#### `app/tickets/page.tsx`
Protected. Server Component with optional search params (`?status=open&severity=critical`). Fetches paginated tickets from Prisma. Renders `<TicketList>`.

#### `app/tickets/[ticketId]/page.tsx`
Protected. Server Component. Fetches ticket + latest `InvestigationRun` + `AgentStep[]`. Renders `<TicketDetail>` and `<InvestigationPanel>`. Contains "Run Investigation" button (client action → `POST /api/agents/run`).

#### `app/investigations/[runId]/page.tsx`
Protected. Server Component. Full investigation trace — all agent steps, hypotheses JSON, final summary, drafted customer reply, escalation note. Renders `<AgentTimeline>` with step-by-step output cards.

#### `app/settings/page.tsx`
Protected Client Component. Form to set preferred LLM model (OpenAI / Claude), Clerk user profile, demo reset button (`POST /api/seed`), optional integration tokens (GitHub, Sentry, Jira).

---

### `app/api/` — Route Handlers

#### `app/api/tickets/route.ts`
- `GET` — list tickets with optional `status`, `severity`, `customerId` query params. Returns paginated JSON.
- `POST` — create a new ticket. Validates body, writes to Prisma, optionally triggers Inngest investigation job.

#### `app/api/tickets/[ticketId]/route.ts`
- `GET` — single ticket with customer relation and latest investigation run.
- `PATCH` — update status, severity, or assignee.
- `DELETE` — soft-delete (set status = "archived").

#### `app/api/investigations/route.ts`
- `GET` — list investigation runs, filterable by ticketId, status.

#### `app/api/investigations/[runId]/route.ts`
- `GET` — full investigation run with all `AgentStep` records. Used by the streaming timeline to poll or SSE.

#### `app/api/agents/run/route.ts`
- `POST` — the trigger endpoint. Receives `{ ticketId }`, creates an `InvestigationRun` record (status: "pending"), then sends an Inngest event `investigation/run.requested`. Returns `{ runId }` immediately so the UI can redirect/poll.

#### `app/api/search/route.ts`
- `GET` — vector similarity search over `KnowledgeChunk` table. Accepts `?q=<query>`. Generates embedding via OpenAI `text-embedding-3-small`, runs pgvector cosine search, returns top-5 chunks. Used by the Knowledge Retrieval Agent tool.

#### `app/api/seed/route.ts`
- `POST` — demo reset. Clears all tickets, customers, investigations, agent steps. Re-seeds from `/data/*.json`. Triggers `scripts/ingest-docs.ts` logic to re-embed knowledge base. Protected by Clerk + admin check.

#### `app/api/webhooks/inngest/route.ts`
- `POST` — Inngest webhook receiver. Registered with `serve()` from `inngest/next`. All Inngest functions are registered here. This is the entry point for all background job execution.

---

### `components/`

#### `components/tickets/ticket-list.tsx`
Client Component. Renders a filterable, sortable table of tickets. Uses shadcn `<Table>`, `<Badge>` for severity. Links to `/tickets/[ticketId]`.

#### `components/tickets/ticket-detail.tsx`
Displays ticket metadata: title, description, customer name/plan/region, created date, current status. Shows the active investigation run summary if present.

#### `components/tickets/severity-badge.tsx`
Small presentational component. Maps severity string (`critical`, `high`, `medium`, `low`) to shadcn `<Badge>` color variant.

#### `components/tickets/investigation-panel.tsx`
Shows investigation status (pending / running / complete / failed). "Run Investigation" button triggers `POST /api/agents/run`. On completion, shows hypothesis list and links to `/investigations/[runId]`.

#### `components/agents/agent-timeline.tsx`
Client Component. Renders ordered list of `AgentStep` records as a vertical timeline. Each step shows agent name, status icon, duration, and expandable output JSON. Optionally polls `/api/investigations/[runId]` while status = "running" (SSE or 2s interval).

#### `components/agents/hypothesis-card.tsx`
Renders a single root-cause hypothesis: description, confidence score (%), supporting evidence list, recommended action.

#### `components/agents/agent-output-card.tsx`
Generic collapsible card for any agent step output. Title = agent name. Body = formatted JSON or markdown depending on agent type.

#### `components/dashboard/kpi-cards.tsx`
Grid of 4 stat cards: Open Tickets, Investigations Today, Avg Resolution Time, Critical Unresolved.

#### `components/dashboard/recent-investigations.tsx`
List of last 5 completed investigations with ticket title, root cause summary, and timestamp.

#### `components/ui/`
shadcn generated components (`button`, `card`, `badge`, `table`, `dialog`, `input`, `select`, `skeleton`, etc.). Not manually authored.

---

### `lib/`

#### `lib/db.ts`
Prisma client singleton. Handles edge-safe instantiation for Next.js hot reload in dev. Exports `prisma`.

#### `lib/auth.ts`
Clerk auth helpers. Exports `requireAuth()` — a wrapper used in Route Handlers to return 401 if no session. Exports `getCurrentUser()`.

#### `lib/env.ts`
Validated environment variables using `zod`. Parses `process.env` at startup, throws on missing required keys. Exports typed `env` object used everywhere instead of raw `process.env`.

#### `lib/embeddings.ts`
Wraps OpenAI `text-embedding-3-small`. Exports `embedText(text: string): Promise<number[]>`. Used by both the ingest script and the search route handler.

#### `lib/vector-search.ts`
Wraps pgvector cosine similarity search via Prisma raw query. Exports `searchKnowledge(embedding: number[], topK: number): Promise<KnowledgeChunk[]>`.

#### `lib/logger.ts`
Lightweight structured logger. Wraps `console.log` with JSON output including `timestamp`, `level`, `service`, `message`. In prod, could forward to a logging provider.

#### `lib/utils.ts`
Shared utilities: `cn()` for Tailwind class merging (re-exported from shadcn), `formatDuration()`, `truncate()`, `slugify()`.

---

### `agents/`

#### `agents/graph.ts`
Defines and compiles the LangGraph `StateGraph`. Registers all nodes (agents), edges, and the parallel fan-out pattern. Exports `runInvestigation(ticketId: string, runId: string)` — called from the Inngest function. Persists each agent step to DB via Prisma as it runs.

#### `agents/state.ts`
TypeScript type for the shared LangGraph state object passed between nodes:
```ts
type InvestigationState = {
  ticketId: string;
  runId: string;
  ticket: Ticket;
  customer: Customer;
  classification: string;
  logs: LogEntry[];
  knowledgeChunks: KnowledgeChunk[];
  incidents: Incident[];
  deployments: Deployment[];
  hypotheses: Hypothesis[];
  draftReply: string;
  escalationNote: string;
}
```

#### `agents/prompts/*.md`
System prompt files for each agent. Loaded at runtime via `fs.readFileSync`. Keeping prompts in markdown files (not hardcoded strings) makes iteration fast.

- `intake.md` — classify ticket: category, severity, affected product
- `log-analysis.md` — identify anomalies in log/trace data
- `knowledge-retrieval.md` — select and summarize relevant runbook sections
- `root-cause.md` — rank hypotheses with confidence scores
- `response-drafting.md` — write empathetic, clear customer email
- `escalation.md` — write internal Jira-style summary with timeline

#### `agents/nodes/intake-agent.ts`
LangGraph node. Calls OpenAI with the ticket title + description + `intake.md` prompt. Returns structured JSON: `{ category, severity, affectedProduct, summary }`. Updates `InvestigationState.classification`.

#### `agents/nodes/customer-context-agent.ts`
LangGraph node. Uses `customer-tool.ts` to fetch customer record from DB. Enriches state with plan tier, region, recent deployments, account age.

#### `agents/nodes/log-analysis-agent.ts`
LangGraph node. Uses `logs-tool.ts` to query `/data/logs.json` and `/data/traces.json` filtered by customer + time window. Sends relevant entries to LLM with `log-analysis.md` prompt. Returns anomalies, error patterns, spike timestamps.

#### `agents/nodes/knowledge-agent.ts`
LangGraph node. Calls `lib/vector-search.ts` with the ticket summary embedding. Retrieves top-5 knowledge chunks. Passes to LLM with `knowledge-retrieval.md` prompt to extract actionable steps.

#### `agents/nodes/root-cause-agent.ts`
LangGraph node. Aggregates outputs from all parallel agents. Calls LLM with `root-cause.md` prompt to produce ranked `Hypothesis[]` with confidence scores. Saves to `InvestigationRun.hypotheses`.

#### `agents/nodes/response-agent.ts`
LangGraph node. Calls LLM with `response-drafting.md` prompt + top hypothesis + customer context. Produces markdown customer reply. Saved to `InvestigationRun.summary`.

#### `agents/nodes/escalation-agent.ts`
LangGraph node. Calls LLM with `escalation.md` prompt. Produces structured escalation note (title, severity, timeline, root cause, recommended actions, affected customer). Optionally posts to GitHub Issues or Jira (if tokens configured in settings).

#### `agents/tools/ticket-tool.ts`
Fetches full ticket + related records from Prisma. Used by intake and root cause agents.

#### `agents/tools/logs-tool.ts`
Reads and filters `data/logs.json` + `data/traces.json`. Supports filtering by customerId, time range, error level. Returns structured `LogEntry[]`.

#### `agents/tools/docs-tool.ts`
Triggers `lib/vector-search.ts`. Wraps the search call for use inside agent nodes. Accepts a query string, returns matching `KnowledgeChunk[]`.

#### `agents/tools/customer-tool.ts`
Fetches `Customer` record from Prisma by customerId. Also fetches related deployments from `data/deployments.json` filtered by customer region/product.

#### `agents/tools/incident-tool.ts`
Reads `data/incidents.json`. Returns incidents matching the ticket's affected product and time window (+/- 24h around ticket creation).

#### `agents/tools/escalation-tool.ts`
Optionally posts escalation to GitHub Issues API or Jira REST API if API tokens are present in env. Otherwise returns the escalation note text only.

---

### `prisma/`

#### `prisma/schema.prisma`
Defines models: `Ticket`, `Customer`, `InvestigationRun`, `AgentStep`, `KnowledgeChunk`. Enables `pgvector` extension for the `KnowledgeChunk.embedding` field. Uses `@db.Vector(1536)` for `text-embedding-3-small` dimensions.

#### `prisma/seed.ts`
Reads from `/data/*.json`, inserts Customer and Ticket records. Does NOT embed knowledge base (that's `scripts/ingest-docs.ts`).

---

### `data/` — Dummy JSON Files

| File | Content |
|---|---|
| `tickets.json` | 7 scripted demo tickets with predictable outcomes |
| `customers.json` | 10 customers with varied plans, regions, industries |
| `logs.json` | OpenTelemetry-style log entries with error codes, service names, timestamps |
| `traces.json` | Distributed trace spans (traceId, spanId, duration, status) |
| `incidents.json` | 3 past incidents (region outages, DB degradation) |
| `deployments.json` | Deployment history per service (version, timestamp, author, changed env vars) |
| `sentry-issues.json` | Sentry-style error events with fingerprint, count, first_seen |

---

### `knowledge-base/` — RAG Source Documents

Markdown files ingested by `scripts/ingest-docs.ts` into `KnowledgeChunk` rows with embeddings.

| File | Content |
|---|---|
| `runbooks/production-500-errors.md` | Checklist for diagnosing 500s |
| `runbooks/auth-token-expiry.md` | SAML/JWT expiry remediation steps |
| `runbooks/database-connection-pool.md` | PgBouncer tuning, connection limits |
| `runbooks/webhook-retry-failures.md` | Signature verification, retry backoff |
| `product-docs/api-rate-limits.md` | Rate limit tiers per plan |
| `product-docs/billing-api.md` | Auth methods, key rotation process |
| `product-docs/deployment-process.md` | CI/CD pipeline, env var injection |
| `internal-notes/known-issues.md` | Current open bugs, workarounds |

---

### `scripts/`

#### `scripts/seed-db.ts`
Runs `prisma/seed.ts` logic as a standalone CLI script. Called via `npm run seed` or `POST /api/seed`.

#### `scripts/ingest-docs.ts`
Reads all `.md` files from `/knowledge-base/`. Chunks each file (~500 tokens). Calls `lib/embeddings.ts` to generate embeddings. Upserts into `KnowledgeChunk` table. Safe to re-run (upsert by source path + chunk index).

#### `scripts/generate-demo-data.ts`
Generates fresh randomized demo data for the JSON files. Useful for regenerating varied demos.

#### `scripts/reset-demo.ts`
Deletes all DB rows, re-runs seed-db + ingest-docs. Idempotent.

---

### Config & Root Files

#### `docker-compose.yml`
Runs Postgres 16 with `pgvector` extension. Exposes port 5432. Sets `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. Used for local dev only.

#### `.env.example`
```
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
OPENAI_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
# Optional
ANTHROPIC_API_KEY=
GITHUB_TOKEN=
SENTRY_AUTH_TOKEN=
JIRA_API_TOKEN=
```

#### `package.json`
Key dependencies:
- `next`, `react`, `typescript`, `tailwindcss`
- `@clerk/nextjs`
- `prisma`, `@prisma/client`
- `openai`
- `@langchain/langgraph`, `@langchain/openai`
- `inngest`
- `zod`
- shadcn/ui components

Key scripts:
- `dev`, `build`, `start`
- `seed` → `tsx scripts/seed-db.ts`
- `ingest` → `tsx scripts/ingest-docs.ts`
- `reset` → `tsx scripts/reset-demo.ts`
- `db:generate`, `db:push`, `db:migrate`

---

## Inngest Function Architecture

```
Event: investigation/run.requested { ticketId, runId }
  └─ Step 1: fetch ticket + customer (DB)
  └─ Step 2: run intake agent
  └─ Step 3: run customer-context agent
  └─ Step 4: fan-out (Promise.all)
       ├─ run log-analysis agent
       ├─ run knowledge-retrieval agent
       ├─ run incident-correlation agent
       └─ run deployment-correlation agent
  └─ Step 5: run root-cause agent
  └─ Step 6: run response-drafting agent
  └─ Step 7: run escalation agent
  └─ Step 8: update InvestigationRun status = "complete"
```

Each step persists an `AgentStep` record to DB immediately so the UI can show real-time progress via polling.

---

## Agent Workflow Data Flow

```
Ticket submitted (POST /api/agents/run)
  → InvestigationRun created (status: pending)
  → Inngest event fired
  → Inngest picks up, runs graph.ts
  → Each node:
      1. Reads from InvestigationState
      2. Calls tool(s) + LLM
      3. Writes AgentStep to DB (status: complete, output: JSON)
      4. Updates InvestigationState
  → Final: InvestigationRun updated with summary, hypotheses, status: complete
  → UI polling sees status change, renders full report
```

---

## Verification / Testing

1. `docker compose up` → Postgres ready
2. `npm run db:push` → schema applied
3. `npm run seed` → customers + tickets inserted
4. `npm run ingest` → knowledge base embedded
5. `npm run dev` → app starts at localhost:3000
6. Sign in via Clerk → redirected to `/dashboard`
7. Navigate to `/tickets` → see 7 demo tickets
8. Click ticket → see detail page
9. Click "Run Investigation" → `POST /api/agents/run` fires
10. Watch `/investigations/[runId]` → agent steps appear as Inngest runs
11. Final state: hypotheses listed, customer draft visible, escalation note shown
12. `/settings` → demo reset clears and re-seeds DB
