# AI Support Operations Platform — Claude Code Instructions

## Critical Rules

- **TypeScript strict mode** — no implicit `any`, no type casting with `as` unless bridging LangGraph/Prisma boundaries (see Known Pitfalls)
- **Never import `prisma` in Client Components** — all DB access must be in Server Components, Route Handlers, or `agents/`
- **Never expose `OPENAI_API_KEY` or `BETTER_AUTH_SECRET` to the client** — use `lib/env.ts` server-side only
- **App Router only** — no `pages/` directory; all routes live under `app/`
- **Agents are server-only** — nothing in `agents/` should ever be imported by a Client Component

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Auth | Better Auth (self-hosted, `better-auth`) with Organizations plugin |
| Database | PostgreSQL + pgvector via Prisma 6 |
| Background jobs | Inngest v3 |
| Agent orchestration | LangGraph.js (`@langchain/langgraph`) |
| LLM | OpenAI (`gpt-4o` reasoning, `gpt-4o-mini` classification/guardrails/eval, `text-embedding-3-small` RAG) |
| Reranker | HuggingFace Inference API (`cross-encoder/ms-marco-MiniLM-L-6-v2`) — optional |
| UI | shadcn/ui (Radix primitives) + Tailwind CSS v3 |
| Validation | Zod |
| Local DB | Docker Compose (pgvector/pgvector:pg16) |

---

## Commands

```bash
npm run dev           # start Next.js dev server
npm run build         # production build
npm run lint          # ESLint via next lint
npx tsc --noEmit      # type-check (no dedicated script — run this directly)

npm run db:generate   # prisma generate (after schema changes)
npm run db:push       # sync schema to local DB (dev only)
npm run db:migrate    # create migration file (use for persistent changes)
npm run db:studio     # Prisma Studio GUI

npm run seed          # insert demo customers + tickets from data/*.json
npm run ingest        # embed knowledge-base/*.md into pgvector
npm run reset         # clear DB + re-seed + re-ingest (idempotent)

# Eval system
npx tsx scripts/run-eval.ts --name nightly-v1    # run eval suite
npx tsx scripts/export-eval-data.ts              # export approved runs → EvalExample rows
```

**Local dev startup sequence:**
```bash
docker compose up -d   # start local postgres+pgvector on :5432
npm run db:push        # apply schema
npm run seed           # load demo data
npm run ingest         # embed knowledge base (requires OPENAI_API_KEY)
npm run dev
# separate terminal:
npx inngest-cli@latest dev  # process background events
```

---

## Directory Structure

```
agents/
  graph.ts              # LangGraph StateGraph — pipeline entry point
  state.ts              # InvestigationState + all shared types (GuardrailsResult, CorrelatedIncident, etc.)
  nodes/                # One file per agent node
    intake-agent.ts
    customer-context-agent.ts
    log-analysis-agent.ts       # + Datadog adapter (Phase 5)
    knowledge-agent.ts          # feeds rerankChunks from lib/reranker.ts
    incident-correlation-agent.ts  # + Sentry adapter (Phase 5)
    deployment-correlation-agent.ts
    root-cause-agent.ts
    response-agent.ts
    guardrails-agent.ts         # Phase 2 — policy enforcement before escalation
    escalation-agent.ts
  tools/                # Data fetchers used by nodes (DB, JSON files)
  prompts/              # System prompt .md files (loaded at runtime via fs.readFileSync)
    guardrails.md       # guardrails policy prompt
    eval-judge.md       # LLM judge scoring rubric

app/
  (dashboard)/          # Route group — all protected pages
    dashboard/          # KPI overview
    tickets/            # Ticket list + [ticketId] detail (shows incident banner)
    investigations/     # Investigation list + [runId] full trace
    approvals/          # Phase 3 — HITL approval queue + [runId] review page
    incidents/          # Phase 6 — incident list + [id] detail
    eval/               # Phase 7 — eval run history + [runId] + examples/
    team/               # Phase 8 — org member list (via Better Auth API)
    settings/           # Model info + integration cards + demo reset
    layout.tsx          # Sidebar with nav + OrgSwitcher + UserMenu + pending approvals badge
  api/
    auth/[...all]/      # Better Auth catch-all handler (GET/POST)
    agents/run/         # POST — triggers investigation via Inngest
    tickets/            # REST CRUD + fires "ticket/created" Inngest event
    investigations/
      [runId]/
        steps/[stepId]/ # GET — step detail for drawer
        approve/        # POST — HITL approve/reject, fires "investigation/approval.submitted"
      pending/          # GET — lists awaiting_approval runs
    incidents/          # GET/POST list; [id] GET/PATCH; [id]/tickets POST
    incidents/suggest/  # GET — candidate ticket clusters
    integrations/
      slack/test/       # POST — test Slack webhook
      zendesk/simulate/ # GET — create demo ticket
      zendesk/import/   # POST — Zendesk webhook receiver
    eval/
      runs/             # GET/POST
      runs/[id]/        # GET
      examples/         # GET/POST
    search/             # GET — pgvector RAG search
    seed/               # POST — demo reset
    webhooks/inngest/   # Inngest receiver (GET/POST/PUT) — must remain public

components/
  auth/
    sign-in-form.tsx        # "use client" email+password sign-in
    sign-up-form.tsx        # "use client" email+password sign-up
    user-menu.tsx           # "use client" dropdown with avatar + sign-out
    org-switcher.tsx        # "use client" org list + create + switch
  agents/
    agent-timeline.tsx      # Live pipeline with clickable steps
    step-detail-drawer.tsx  # Slide-over drawer (Tailwind, no Radix)
    evidence-panel.tsx      # KB chunks with rerank scores
    token-usage-badge.tsx   # "1.2k tokens · ~$0.002"
    pipeline-timing-bar.tsx # Gantt-style timing bar
    guardrails-badge.tsx    # Warn/block flag indicators
    hypothesis-card.tsx
    agent-output-card.tsx
  approvals/
    approval-queue-table.tsx  # SLA timer, customer tier badge
    reply-editor.tsx          # Textarea + diff + approve/reject buttons
  incidents/
    incident-header.tsx         # Severity banner (P0/P1/P2 color)
    affected-customers-table.tsx
    status-page-editor.tsx      # "use client" preview/edit textarea
    incident-timeline.tsx       # Vertical timeline of status events
  eval/
    score-card.tsx      # Per-dimension score bars
    pass-rate-chart.tsx # Pure CSS/SVG bar chart trend
  settings/
    integration-card.tsx  # live/mock indicator, test button ("use client")
    demo-reset.tsx        # Reset button extracted as client component
  team/
    member-list.tsx     # Org member table with role badges
  dashboard/
  tickets/
  ui/                   # shadcn primitives (button, badge, card, etc.)

lib/
  db.ts               # Prisma singleton (hot-reload safe)
  better-auth.ts      # Better Auth instance (prismaAdapter, organization plugin, nextCookies)
  auth.ts             # auth(), getSession(), requireAuth(), requireOrgAuth() — drop-in Clerk replacement
  auth-client.ts      # Client-side auth (createAuthClient, signIn, signUp, signOut, useSession)
  embeddings.ts       # embedText() wrapping text-embedding-3-small
  env.ts              # Zod-validated env (server-only)
  vector-search.ts    # searchKnowledge() pgvector raw query
  agent-utils.ts      # extractTokenUsage(), estimateCostUsd()
  guardrails-rules.ts # Deterministic PII/secret regex checks → GuardrailFlag[]
  reranker.ts         # HF cross-encoder reranker with 5-min cache + fallback
  incident-clustering.ts  # Heuristic clustering (same product/category/region, 4h window)
  eval-runner.ts      # Eval orchestration — runs graph directly (bypasses Inngest)
  eval-judge.ts       # gpt-4o-mini judge scoring 4 dimensions
  logger.ts           # Structured JSON logger
  utils.ts            # cn(), formatDuration(), formatRelativeTime()
  integrations/
    types.ts          # IIntegrationAdapter interface
    sentry/{client,mock,index}.ts
    slack/{client,mock,index}.ts
    datadog/{mock,index}.ts
    zendesk/{mock,index}.ts

inngest/
  client.ts           # Inngest client singleton
  functions.ts        # runInvestigationFunction (HITL) + clusterTicketsFunction

prisma/
  schema.prisma       # All models — see Model section below

scripts/
  seed-db.ts          # Standalone seed runner
  ingest-docs.ts      # Standalone embedding ingestion
  reset-demo.ts       # Full demo reset orchestrator
  run-eval.ts         # CLI eval runner
  export-eval-data.ts # Bootstrap EvalExample rows from approved investigations

data/                 # Static JSON demo fixtures — do NOT edit to fix bugs
knowledge-base/       # Markdown docs embedded into pgvector
```

---

## Prisma Models

```
User              — Better Auth user (id, name, email, image)
Session           — Better Auth session (token, expiresAt, activeOrganizationId)
Account           — Better Auth account (provider credentials)
Verification      — Better Auth email verification tokens
Organization      — Better Auth org (name, slug)
Member            — Better Auth org membership (userId, organizationId, role)
Invitation        — Better Auth org invitations

Customer          — tenant customer records
Ticket            — support tickets; has assigneeId, messages TicketMessage[], workItems WorkItem[]
InvestigationRun  — one per investigation; has approvalStatus, guardrailsResult,
                    editedReply, reviewerNote, orgId, workItems WorkItem[]
AgentStep         — one per agent node; has tokenUsage, toolsCalled, confidenceScore
ApprovalAudit     — HITL approval/rejection record with original+final draft
KnowledgeChunk    — pgvector embeddings (Unsupported vector type — use $executeRaw)
Incident          — clustered incident with status, severity, internalTimeline Json, workItems WorkItem[]
IncidentTicket    — join table (Incident ↔ Ticket)
IntegrationConfig — metadata for external integrations
EvalExample       — golden test cases (bootstrapped from approved runs)
EvalRun           — one eval run with aggregate pass rate
EvalResult        — per-example scores (rootCause, evidence, tone, hallucination)
WorkItem          — canonical unit of responsibility; type, status (state machine), priorityScore/Band,
                    optional FKs to Ticket/InvestigationRun/Incident, events WorkItemEvent[]
WorkSignal        — immutable incoming event; idempotencyKey unique, processingStatus,
                    reconciled to WorkItem after AI extraction
WorkItemEvent     — immutable audit trail for WorkItem lifecycle changes
AgentWorkContext  — cached per-agent summary; @@unique([agentId, orgId])
TicketMessage     — conversation messages on tickets; authorType (customer|agent|system|ai)
```

---

## Architecture Boundaries

### Server vs. Client Components

- Default to **Server Components** — add `"use client"` only for interactivity
- Client Components: `InvestigationPanel`, `AgentTimeline`, `AgentOutputCard`, `TicketList`, `StatusPageEditor`, `IntegrationCard`, `DemoReset`, `ReplyEditor`, `StepDetailDrawer`, `PriorityQueue`, `WorkItemCard`, `WorkItemActions`, `ShiftBriefing`, `ResponsibilityMap`, `WorkAssistant`, `NeedsClassificationQueue`, `SignInForm`, `SignUpForm`, `UserMenu`, `OrgSwitcher`
- `settings/page.tsx` is a **Server Component** — it reads `process.env` to determine live/mock status and passes `isLive` down to `IntegrationCard`
- **Never** call `prisma` or `lib/env.ts` from a Client Component
- **Never** import anything from `agents/` in a Client Component

### Agent Pipeline

```
POST /api/agents/run
  → creates InvestigationRun (status: pending)
  → inngest.send("investigation/run.requested")
  → returns { runId } immediately

Inngest runInvestigationFunction:
  Step 1 — execute graph:
    intake → customer_context → parallel(log_analysis, knowledge_retrieval,
    incident_correlation, deployment_correlation) → root_cause →
    response_drafting → guardrails → escalation
  Step 2 — set status: awaiting_approval
  Step 3 — step.waitForEvent("investigation/approval.submitted", { timeout: "72h" })
  Step 4 — process approval (write ApprovalAudit, post Slack, send reply)

Inngest clusterTicketsFunction:
  Triggered by "ticket/created" — runs clustering heuristic, auto-creates Incidents
```

Each agent node must:
1. Create an `AgentStep` with `status: "running"` at start
2. Do its LLM/tool work — capture `response.usage` via `extractTokenUsage()`
3. Update step to `status: "complete"` with `output` JSON + `tokenUsage`
4. Return `Partial<InvestigationState>` — never mutate state directly

### LangGraph State

State is defined with `Annotation.Root()` in `agents/graph.ts`. Every reducer uses `(_, b) => b` (last-write-wins). When adding new state fields:

```ts
// agents/state.ts — add to InvestigationState interface
// agents/graph.ts — add Annotation field with same name
```

**IMPORTANT:** The interface `CorrelatedIncident` in `agents/state.ts` is NOT the same as the Prisma `Incident` model. `CorrelatedIncident` represents an incident found during correlation analysis (stored in `InvestigationState.correlatedIncidents`). The Prisma `Incident` model is the Phase 6 clustering model in the DB. Never import the Prisma `Incident` type in agents/ — use `CorrelatedIncident`.

### Prisma JSON Columns

`InvestigationRun.hypotheses`, `AgentStep.output/input`, `AgentStep.tokenUsage`, `InvestigationRun.guardrailsResult`, `Incident.internalTimeline` are `Json?`. To write:

```ts
// Correct
data: { hypotheses: JSON.parse(JSON.stringify(hypotheses)) }

// Wrong — TypeScript error
data: { hypotheses: hypotheses }
```

### HITL Approval Flow

The `step.waitForEvent()` in Inngest waits up to 72h for `POST /api/investigations/[runId]/approve`. The approve endpoint:
1. Writes `ApprovalAudit` record
2. Updates `InvestigationRun.approvalStatus` + `editedReply`
3. Fires `inngest.send({ name: "investigation/approval.submitted", data: { runId, action } })`

**Resilience:** The DB write happens before the Inngest event. If Inngest can't resume (e.g. dev restart), the DB still reflects the correct approval state.

### Integration Adapters

`lib/integrations/[name]/index.ts` returns real client if env var is set, mock otherwise. No code changes needed to switch modes. Current integrations: `sentry`, `slack`, `datadog`, `zendesk`.

### HuggingFace Reranker

`lib/reranker.ts::rerankChunks(query, chunks)`:
- Requires `HUGGING_FACE_API_KEY` env var
- Falls back to original pgvector order if key absent or API fails
- 5-min in-memory cache keyed by `hash(query + chunk ids)`
- Used in `agents/tools/docs-tool.ts`: fetch 15 candidates → rerank → return top 5

---

## Authentication (Better Auth)

- Self-hosted auth via `better-auth` — all auth data stored in Postgres (User, Session, Account, Organization, Member models)
- Auth instance: `lib/better-auth.ts` — betterAuth() with prismaAdapter, emailAndPassword, organization plugin, nextCookies
- Client: `lib/auth-client.ts` — createAuthClient() with organizationClient plugin (client-side only)
- API handler: `app/api/auth/[...all]/route.ts` — handles all auth endpoints
- All routes except `/`, `/sign-in`, `/sign-up`, `/api/auth/*`, `/api/webhooks/*` protected by `middleware.ts` (cookie check)
- In Server Components/Route Handlers: `const { userId, orgId, orgRole } = await auth()` from `@/lib/auth`
- `lib/auth.ts` exports:
  - `auth()` → `{ userId, orgId, orgRole }` (drop-in replacement for old Clerk auth)
  - `getSession()` → full Better Auth session object
  - `requireAuth()` → `{ userId, response }` — returns 401 response if not authenticated
  - `requireOrgAuth()` → `{ userId, orgId, orgRole, response }` — returns 401 response if not authenticated
- To fetch org members: use `auth.api.getFullOrganization({ headers, query: { organizationId } })` from `lib/better-auth.ts`
- Role names: `owner`, `admin`, `member` (not `org:admin`, `org:analyst`, `org:viewer`)
- The Inngest webhook route must remain public

---

## Database Rules

- **Dev schema changes**: `npm run db:push` (no migration file)
- **Production schema changes**: `npm run db:migrate` (creates versioned migration)
- **After any schema change**: `npm run db:generate` then restart dev server
- `KnowledgeChunk.embedding` uses `Unsupported("vector(1536)")` — vector ops require `prisma.$queryRaw` or `prisma.$executeRaw`
- Vector search uses cosine distance `<=>` — see `lib/vector-search.ts`
- Prisma client singleton in `lib/db.ts` — never instantiate `new PrismaClient()` elsewhere

---

## Environment Variables

Required:
```
DATABASE_URL                       # postgres://...
OPENAI_API_KEY                     # LLM calls + embeddings
BETTER_AUTH_SECRET                 # session signing secret (self-hosted auth)
```

Optional — live vs. mock:
```
HUGGING_FACE_API_KEY   # reranker (fallback: pgvector order)
SLACK_WEBHOOK_URL      # Slack notifications (fallback: console.log)
DATADOG_API_KEY        # log enrichment (fallback: mock logs)
ZENDESK_API_TOKEN      # Zendesk import (fallback: mock)
ZENDESK_SUBDOMAIN      # e.g. yourorg
SENTRY_AUTH_TOKEN      # incident correlation (fallback: mock issues)
INNGEST_EVENT_KEY      # defaults to "local" in dev
INNGEST_SIGNING_KEY    # required in production
GITHUB_TOKEN           # escalation issue creation
JIRA_API_TOKEN         # escalation ticket creation
JIRA_BASE_URL          # e.g. https://yourorg.atlassian.net
```

- All env access through `lib/env.ts` (Zod-validated) — never `process.env.X` in app code
- Exception: `settings/page.tsx` checks `!!process.env[key]` purely for display (safe — no secret value exposed)

---

## Adding a New Agent Node

1. Create `agents/nodes/my-agent.ts`:
   - Create AgentStep `status: "running"`
   - Call LLM — capture `extractTokenUsage(response)` from `lib/agent-utils.ts`
   - Update step `status: "complete"` with `output` + `tokenUsage`
   - Return `Partial<InvestigationState>`
2. Add label to `components/agents/agent-timeline.tsx` (`agentLabels` map + `PIPELINE` constant)
3. Add node + edges to `agents/graph.ts`
4. Add prompt to `agents/prompts/my-agent.md` if needed
5. Add new state fields to `agents/state.ts` + `Annotation.Root()` in `agents/graph.ts`

---

## Adding UI Components

- Presentational-only components in `components/` — no direct DB access
- Use existing shadcn primitives from `components/ui/` first
- Client Components receive data as props from parent Server Components
- Use `lib/utils.ts::cn()` for conditional Tailwind class merging
- Status/severity color mappings inline in each component — keep consistent

---

## Inngest

- Functions in `inngest/functions.ts`, registered in `app/api/webhooks/inngest/route.ts`
- Timeout key: `timeouts: { finish: "10m" }` (NOT `timeout`)
- `waitForEvent` timeout: `"72h"` for HITL approval
- In dev: `npx inngest-cli@latest dev` in a separate terminal
- Events fired with `inngest.send({ name: "...", data: {...} })`
- Client in `inngest/client.ts` — import from there only
- Mission Control functions:
  - `processWorkSignalFunction` — `work-signal/received` → AI extraction → reconciliation → WorkItem
  - `recalculatePrioritiesFunction` — `work-items/recalculate` → batch priority recalc for org
  - `refreshAgentContextFunction` — `work-context/refresh.requested` → refresh AgentWorkContext
  - `activateScheduledFollowupsFunction` — cron 5min → resume SNOOZED items past snoozedUntil
  - `generateShiftBriefingFunction` — `shift-briefing/generate.requested` → AI briefing
  - `detectStaleResponsibilitiesFunction` — cron 15min → bump priority on stale IN_PROGRESS items

---

## RAG / Knowledge Base

- Source docs in `knowledge-base/` as Markdown
- Run `npm run ingest` to chunk + embed into `KnowledgeChunk` (safe to re-run — upserts by `[sourcePath, chunkIndex]`)
- Embeddings: `text-embedding-3-small` (1536 dimensions) via `lib/embeddings.ts`
- Vector search: `lib/vector-search.ts::searchKnowledge(embedding, topK)`
- Reranking: `lib/reranker.ts::rerankChunks(query, chunks)` — called by `agents/tools/docs-tool.ts`

---

## Eval System

- **Examples bootstrapped** by running `npx tsx scripts/export-eval-data.ts` after several investigations are approved
- **Eval run** triggered via `npx tsx scripts/run-eval.ts --name <name>`
- `lib/eval-runner.ts` runs graph directly (bypasses Inngest) against each `EvalExample`
- `lib/eval-judge.ts` uses gpt-4o-mini with rubric from `agents/prompts/eval-judge.md` to score 4 dimensions:
  - Root cause accuracy (35%), Evidence quality (25%), Response tone (20%), No hallucinations (20%)
- Results visible at `/eval` and `/eval/[runId]`

---

## Known Pitfalls

- **LangGraph `as unknown as InvestigationState` casts** in `graph.ts` are intentional — do not remove
- **`searchParams` warnings** on route handlers using `new URL(request.url).searchParams` — false positives (sync URL API, not Next.js page prop)
- **pgvector raw queries** — interpolate as `${vectorStr}::vector`, never parameterize differently
- **Prompt files** — `fs.readFileSync(join(process.cwd(), "agents/prompts/..."))` only works in Node.js server context; never call from Edge Runtime
- **Demo data not tied to real auth users** — seed is idempotent via upsert on `email` / `externalId`
- **`KnowledgeChunk` no Prisma vector ops** — use `prisma.$executeRaw` (see `scripts/ingest-docs.ts`)
- **`CorrelatedIncident` vs `Incident`** — `CorrelatedIncident` is the state interface in `agents/state.ts`; `Incident` is the Prisma DB model. Never confuse them.
- **Inngest `waitForEvent` lost on restart** — the DB write in the approve API happens first, so UI always reflects correct state even if Inngest can't resume
- **Eval in dev** — `lib/eval-runner.ts` creates ephemeral tickets under the first customer in the DB; these persist after eval runs

---

## Mission Control

### Work Item State Machine

```
OPEN → IN_PROGRESS | SNOOZED | CANCELLED | NEEDS_CLASSIFICATION
IN_PROGRESS → WAITING_CUSTOMER | WAITING_INTERNAL | COMPLETED | SNOOZED | CANCELLED | OPEN
WAITING_CUSTOMER → IN_PROGRESS | OPEN | COMPLETED | CANCELLED
WAITING_INTERNAL → IN_PROGRESS | OPEN | COMPLETED | CANCELLED
SNOOZED → OPEN
NEEDS_CLASSIFICATION → OPEN | IN_PROGRESS | CANCELLED
COMPLETED → (terminal)
CANCELLED → (terminal)
```

### Key Files

- `lib/priority-engine.ts` — deterministic scoring (pure functions, no DB)
- `lib/work-items.ts` — CRUD + state machine with audit trail
- `lib/work-context.ts` — context builder for agent work summaries
- `lib/signal-processor.ts` — AI action extraction + reconciliation
- `lib/shift-briefing.ts` — AI-generated workload summaries
- `app/(dashboard)/mission-control/page.tsx` — Server Component page
- `components/mission-control/` — all client components

### API Routes

- `GET/POST /api/work-items` — list/create work items
- `GET/PATCH /api/work-items/[id]` — single item CRUD
- `POST /api/work-items/[id]/{complete,snooze,wait,resume,delegate,correct}` — actions
- `GET /api/work-context` — cached context
- `POST /api/work-context/refresh` — refresh context
- `POST /api/work-context/chat` — AI work assistant
- `GET/POST /api/work-signals` — list/receive signals
- `POST /api/work-signals/simulate` — generate mock signals

### Seeds

- `npm run seed:work-items` — creates demo WorkItems, TicketMessages, WorkSignals, WorkItemEvents
- Depends on base `npm run seed` having run first

---

## Do NOT

- Add `"use client"` to Server Component pages in `app/(dashboard)/`
- Use `process.env.OPENAI_API_KEY` directly — always go through `lib/env.ts::getEnv()`
- Create a new Prisma client instance anywhere — import `prisma` from `lib/db.ts`
- Add new dependencies without checking existing libraries first
- Modify `data/*.json` files to fix bugs — they are demo fixtures
- Call `agents/graph.ts::runInvestigation()` directly from a Route Handler — always through Inngest (exception: `lib/eval-runner.ts` which is eval-only)
- Use the old LangGraph `{ channels: {} }` StateGraph constructor — use `Annotation.Root()`
- Import the Prisma `Incident` type in `agents/` — use `CorrelatedIncident` from `agents/state.ts`
- Hard-code severity/status strings — they are documented as comments in `prisma/schema.prisma`

---

## Deployment Notes

- **Docker Compose** is for local dev only — production uses Neon (hosted Postgres with pgvector)
- The `pgvector` extension must be enabled in production DB before migrations
- Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in production environment
- `next.config.ts` sets `serverComponentsExternalPackages: ["@prisma/client", "prisma"]` — required for Prisma in App Router
- Inngest webhook URL in production: `https://your-domain.com/api/webhooks/inngest`
- `orgId` fields default to `""` on existing records — run a backfill before enforcing org scoping in queries
