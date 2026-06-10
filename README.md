# AI Support Operations Platform

A portfolio-grade multi-agent AI system for automated support ticket investigation. When a support ticket is submitted, a LangGraph-orchestrated pipeline of specialized AI agents runs in the background — classifying the ticket, analyzing logs, retrieving relevant runbooks via RAG, correlating incidents and deployments, generating root-cause hypotheses, drafting a customer reply, enforcing guardrails, and routing through a human-in-the-loop approval queue before delivery.

Built with Next.js 15, LangGraph.js, Inngest, Prisma + pgvector, and Clerk. Ships with a full eval system, incident clustering, real-time agent telemetry, and adapter-based external integrations (Slack, Sentry, Datadog, Zendesk).

**In this article**

- [Demo Walkthrough](#demo-walkthrough)
- [Tech Stack](#tech-stack)
- [File Structure](#file-structure)
- [Authentication Flow](#authentication-flow)
- [Agent Pipeline Data Flow](#agent-pipeline-data-flow)
- [HITL Approval Flow](#hitl-approval-flow)
- [Guardrails](#guardrails)
- [Incident Clustering](#incident-clustering)
- [Eval System](#eval-system)
- [Database Schema](#database-schema)
- [RAG Pipeline](#rag-pipeline)
- [Setup](#setup)
- [Key Commands](#key-commands)
- [Optional Integrations](#optional-integrations)
- [Demo Tickets](#demo-tickets)

---

## Demo Walkthrough

1. Sign in → redirected to `/dashboard` (KPI overview)
2. Navigate to `/tickets` → 7 pre-seeded support tickets
3. Click any ticket → view ticket detail + customer context
4. Click **Run Investigation** → fires background agent pipeline
5. Redirected to `/investigations/[runId]` → watch agent steps appear in real time (2s polling); view token usage, timing bar, evidence panel, guardrails badge per step
6. Investigation reaches `awaiting_approval` → appears in `/approvals` with SLA timer
7. Reviewer edits draft reply → clicks **Approve** or **Reject** → Slack notification sent
8. Incidents auto-clustered at `/incidents` — P0/P1/P2 severity banners, status-page editor, affected-customer table
9. Eval runs visible at `/eval` — pass rate trend chart, per-dimension scores per golden example
10. Org members listed at `/team` via Clerk Organizations

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Auth | Clerk (`@clerk/nextjs` v6) with Organizations |
| Agent orchestration | LangGraph.js (`@langchain/langgraph`) |
| LLM | OpenAI `gpt-4o` (reasoning), `gpt-4o-mini` (classification / guardrails / eval) |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| Reranker | HuggingFace Inference API (`cross-encoder/ms-marco-MiniLM-L-6-v2`) — optional |
| Background jobs | Inngest v3 |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 6 |
| UI | shadcn/ui (Radix primitives) + Tailwind CSS v3 |
| Validation | Zod |
| Local DB | Docker Compose (`pgvector/pgvector:pg16`) |

---

## File Structure

```
signal-ops-ai-v1/
│
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout — ClerkProvider, global CSS
│   ├── page.tsx                      # Public landing page (redirects if authed)
│   ├── globals.css
│   ├── sign-in/[[...sign-in]]/
│   ├── sign-up/[[...sign-up]]/
│   │
│   ├── (dashboard)/                  # Protected route group
│   │   ├── layout.tsx                # Async Server Component — sidebar + OrganizationSwitcher + pending-approvals badge
│   │   ├── dashboard/page.tsx        # KPI cards + recent investigations
│   │   ├── tickets/
│   │   │   ├── page.tsx              # Filterable ticket list
│   │   │   └── [ticketId]/page.tsx   # Ticket detail + investigation panel + incident banner
│   │   ├── investigations/
│   │   │   ├── page.tsx              # All investigation runs
│   │   │   └── [runId]/page.tsx      # Full trace view — timeline, timing bar, evidence panel, hypotheses, reply
│   │   ├── approvals/                # Phase 3 — HITL review
│   │   │   ├── page.tsx              # Approval queue with SLA timers + customer tier badges
│   │   │   └── [runId]/page.tsx      # Draft editor + diff + approve/reject
│   │   ├── incidents/                # Phase 6 — incident management
│   │   │   ├── page.tsx              # Incident list with P0/P1/P2 severity banners
│   │   │   └── [id]/page.tsx         # Detail: affected customers, status-page editor, timeline
│   │   ├── eval/                     # Phase 7 — eval system
│   │   │   ├── page.tsx              # Eval run history + pass rate trend chart
│   │   │   ├── [runId]/page.tsx      # Per-example scores + dimension breakdowns
│   │   │   └── examples/page.tsx     # Golden example browser
│   │   ├── team/page.tsx             # Phase 8 — org member list (Clerk API)
│   │   ├── admin/                    # Admin: generate demo tickets/incidents
│   │   └── settings/page.tsx         # Model info, integration cards, demo reset
│   │
│   └── api/
│       ├── agents/run/route.ts       # POST — trigger investigation via Inngest
│       ├── tickets/                  # GET list, POST create (fires "ticket/created" event)
│       │   └── [ticketId]/           # GET, PATCH, DELETE
│       ├── investigations/
│       │   ├── route.ts              # GET list
│       │   ├── pending/route.ts      # GET — awaiting_approval runs
│       │   └── [runId]/
│       │       ├── route.ts          # GET single run + steps
│       │       ├── approve/route.ts  # POST — HITL approve/reject
│       │       └── steps/[stepId]/   # GET — step detail for drawer
│       ├── incidents/                # GET list, POST create
│       │   ├── suggest/route.ts      # GET — candidate ticket clusters
│       │   └── [id]/
│       │       ├── route.ts          # GET detail, PATCH status/severity
│       │       └── tickets/route.ts  # POST — link ticket to incident
│       ├── integrations/
│       │   ├── slack/test/           # POST — test Slack webhook
│       │   └── zendesk/
│       │       ├── simulate/         # GET — create demo ticket via Zendesk mock
│       │       └── import/           # POST — Zendesk webhook receiver
│       ├── eval/
│       │   ├── runs/route.ts         # GET list, POST trigger
│       │   ├── runs/[id]/route.ts    # GET single run with results
│       │   └── examples/route.ts     # GET list, POST create
│       ├── search/route.ts           # GET — pgvector RAG search
│       ├── seed/route.ts             # POST — demo database reset
│       └── webhooks/inngest/         # Inngest receiver (GET/POST/PUT) — public
│
├── agents/                           # Agent pipeline (server-only)
│   ├── graph.ts                      # LangGraph StateGraph — pipeline entry point
│   ├── state.ts                      # InvestigationState + all shared types
│   ├── nodes/
│   │   ├── intake-agent.ts           # Classify ticket category/severity
│   │   ├── customer-context-agent.ts # Fetch customer record + recent deployments
│   │   ├── log-analysis-agent.ts     # Error patterns (+ Datadog adapter)
│   │   ├── knowledge-agent.ts        # RAG search → rerank → return top 5 chunks
│   │   ├── incident-correlation-agent.ts   # Match related past incidents (+ Sentry adapter)
│   │   ├── deployment-correlation-agent.ts # Match relevant deployments
│   │   ├── root-cause-agent.ts       # Rank hypotheses with confidence scores
│   │   ├── response-agent.ts         # Draft customer-facing reply
│   │   ├── guardrails-agent.ts       # Phase 2 — PII/secret/policy enforcement + optional LLM revision
│   │   └── escalation-agent.ts       # Internal escalation note; optionally posts to GitHub / Jira
│   ├── prompts/                      # LLM system prompts loaded via fs.readFileSync
│   │   ├── intake.md
│   │   ├── log-analysis.md
│   │   ├── knowledge-retrieval.md
│   │   ├── root-cause.md
│   │   ├── response-drafting.md
│   │   ├── guardrails.md             # Guardrails policy prompt
│   │   ├── escalation.md
│   │   └── eval-judge.md             # LLM judge scoring rubric
│   └── tools/
│       ├── ticket-tool.ts
│       ├── logs-tool.ts
│       ├── docs-tool.ts              # pgvector search → rerankChunks → top 5
│       ├── customer-tool.ts
│       ├── incident-tool.ts
│       └── escalation-tool.ts
│
├── components/
│   ├── agents/
│   │   ├── agent-timeline.tsx        # Live pipeline with clickable steps (2s polling)
│   │   ├── step-detail-drawer.tsx    # Slide-over: full step input/output/tools
│   │   ├── evidence-panel.tsx        # KB chunks with similarity + rerank scores
│   │   ├── token-usage-badge.tsx     # "1.2k tokens · ~$0.002"
│   │   ├── pipeline-timing-bar.tsx   # Gantt-style timing bar
│   │   ├── guardrails-badge.tsx      # Warn/block flag indicators
│   │   ├── hypothesis-card.tsx
│   │   └── agent-output-card.tsx
│   ├── approvals/
│   │   ├── approval-queue-table.tsx  # SLA countdown, customer tier badge
│   │   └── reply-editor.tsx          # Textarea + original/edited diff + approve/reject
│   ├── incidents/
│   │   ├── incident-header.tsx       # P0/P1/P2 severity banner
│   │   ├── affected-customers-table.tsx
│   │   ├── status-page-editor.tsx    # Preview/edit textarea (client component)
│   │   └── incident-timeline.tsx     # Vertical timeline from internalTimeline JSON
│   ├── eval/
│   │   ├── score-card.tsx            # Per-dimension score bars
│   │   └── pass-rate-chart.tsx       # Pure CSS/SVG bar chart trend
│   ├── settings/
│   │   ├── integration-card.tsx      # Live/mock indicator + test button (client component)
│   │   └── demo-reset.tsx            # Reset button (client component)
│   ├── team/
│   │   └── member-list.tsx           # Org member table with role badges
│   ├── dashboard/
│   ├── tickets/
│   └── ui/                           # shadcn/ui primitives
│
├── inngest/
│   ├── client.ts                     # Inngest client singleton + event types
│   └── functions.ts                  # runInvestigationFunction (HITL) + clusterTicketsFunction
│
├── lib/
│   ├── db.ts                         # Prisma client singleton (hot-reload safe)
│   ├── auth.ts                       # requireAuth() + requireOrgAuth()
│   ├── env.ts                        # Zod-validated env vars (server-only)
│   ├── embeddings.ts                 # embedText() — text-embedding-3-small
│   ├── vector-search.ts              # searchKnowledge() — pgvector cosine search
│   ├── agent-utils.ts                # extractTokenUsage(), estimateCostUsd(), formatCostUsd()
│   ├── guardrails-rules.ts           # Deterministic PII/secret regex checks → GuardrailFlag[]
│   ├── reranker.ts                   # HF cross-encoder with 5-min cache + fallback
│   ├── incident-clustering.ts        # Heuristic clustering (same product/category/region, 4h window)
│   ├── eval-runner.ts                # Eval orchestration — runs graph directly (bypasses Inngest)
│   ├── eval-judge.ts                 # gpt-4o-mini judge scoring 4 dimensions
│   ├── logger.ts                     # Structured JSON logger
│   ├── utils.ts                      # cn(), formatDuration(), truncate(), slugify(), severityColor()
│   └── integrations/
│       ├── types.ts                  # IIntegrationAdapter interface
│       ├── sentry/{client,mock,index}.ts
│       ├── slack/{client,mock,index}.ts
│       ├── datadog/{mock,index}.ts
│       └── zendesk/{mock,index}.ts
│
├── prisma/
│   ├── schema.prisma                 # All models
│   └── seed.ts
│
├── scripts/
│   ├── seed-db.ts                    # Insert demo customers + tickets
│   ├── ingest-docs.ts                # Embed knowledge-base/ into pgvector
│   ├── reset-demo.ts                 # Clear + re-seed + re-ingest
│   ├── knowledge-fetch-docs.ts       # Fetch/cache external docs
│   ├── knowledge-ingest.ts           # Embed fetched knowledge docs
│   ├── knowledge-reset.ts
│   ├── knowledge-evaluate.ts
│   ├── run-eval.ts                   # CLI eval runner
│   └── export-eval-data.ts           # Bootstrap EvalExample rows from approved runs
│
├── __tests__/                        # Unit tests (Vitest)
│   ├── utils.test.ts
│   ├── guardrails-rules.test.ts
│   └── agent-utils.test.ts
│
├── data/                             # Static JSON demo fixtures
│   ├── customers.json
│   ├── tickets.json
│   ├── logs.json
│   ├── traces.json
│   ├── incidents.json
│   ├── deployments.json
│   └── sentry-issues.json
│
├── knowledge-base/                   # RAG source documents (Markdown)
│   ├── runbooks/
│   ├── product-docs/
│   └── internal-notes/
│
├── middleware.ts                     # Clerk auth gate
├── next.config.ts
├── vitest.config.ts
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

---

## Authentication Flow

```
Browser                    Clerk                    App
  │                          │                        │
  │── GET /dashboard ────────┼────────────────────────►
  │                          │         middleware.ts runs
  │                          │         auth().protect() called
  │                          │         no session found
  │◄─────────────── 302 redirect to /sign-in ─────────│
  │                          │                        │
  │── POST /sign-in ─────────►                        │
  │   (email + password)     │ validates credentials  │
  │◄─── session cookie ──────│                        │
  │                          │                        │
  │── GET /dashboard ────────┼────────────────────────►
  │                          │         auth() → userId present
  │◄──────────── 200 /dashboard page ─────────────────│
```

- `middleware.ts` — `clerkMiddleware` protects all routes except `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/api/webhooks/(.*)`
- `lib/auth.ts` exports `requireAuth()` → `{ userId }` and `requireOrgAuth()` → `{ userId, orgId, orgRole }`
- Server Components call `auth()` from `@clerk/nextjs/server` directly

---

## Agent Pipeline Data Flow

### 1. Trigger (HTTP)

```
User clicks "Run Investigation"
  │
  └─► POST /api/agents/run  { ticketId }
        ├─ Verify ticket exists (Prisma)
        ├─ Create InvestigationRun  { status: "pending" }
        ├─ inngest.send("investigation/run.requested", { ticketId, runId })
        └─ Return { runId } → browser redirects to /investigations/[runId]
```

### 2. Background Execution (Inngest → LangGraph)

```
Inngest picks up "investigation/run.requested"
  │
  └─► runInvestigationFunction
        │
        Step 1 — execute graph:
          intake → customer_context
            → parallel(log_analysis, knowledge_retrieval,
                       incident_correlation, deployment_correlation)
            → root_cause → response_drafting → guardrails → escalation
        Step 2 — set status: "awaiting_approval", approvalStatus: "pending"
        Step 3 — step.waitForEvent("investigation/approval.submitted", timeout: "72h")
        Step 4 — process approval (write ApprovalAudit, post Slack, update run)
```

### 3. Per-Agent Step Pattern

Every agent node follows this pattern:

```ts
// 1. Record start
const step = await prisma.agentStep.create({
  data: { investigationRunId, agentName, status: "running", input: {...} }
});

// 2. Do work
const response = await openai.chat.completions.create({...});
const tokenUsage = extractTokenUsage(response);

// 3. Record completion
await prisma.agentStep.update({
  where: { id: step.id },
  data: { status: "complete", output: result, tokenUsage: JSON.parse(JSON.stringify(tokenUsage)), completedAt: new Date() }
});

// 4. Return state patch
return { fieldName: parsedResult };
```

### 4. Real-Time UI Updates

```
Browser (/investigations/[runId])
  └─ AgentTimeline (Client Component)
       ├─ setInterval(router.refresh, 2000) while status = "running"
       └─ Each refresh → Server Component re-fetches InvestigationRun + AgentStep[]
```

---

## HITL Approval Flow

```
Investigation completes
  │
  ├─ Inngest sets status: "awaiting_approval"
  ├─ Run appears in /approvals with SLA timer
  │
  └─ Reviewer opens /approvals/[runId]
       ├─ Sees original draft + editable textarea
       ├─ Clicks Approve or Reject
       │
       └─► POST /api/investigations/[runId]/approve
             ├─ Writes ApprovalAudit (original draft, final draft, reviewer note, actor)
             ├─ Updates InvestigationRun (approvalStatus, editedReply, approvedAt)
             └─ inngest.send("investigation/approval.submitted")
                  └─ Inngest resumes → posts Slack notification
```

**Resilience:** The DB write happens before the Inngest event. If Inngest restarts, the UI always reflects the correct approval state.

---

## Guardrails

The `guardrails-agent` runs after `response_drafting`, before `escalation`.

**Two-pass approach:**

1. **Deterministic pass** (`lib/guardrails-rules.ts`) — regex checks for PII (email, phone, SSN, credit card), secrets (OpenAI keys, GitHub PATs, Slack tokens, generic API keys), and internal content markers (`[INTERNAL]`, `do not share`, etc.)
2. **LLM pass** (`gpt-4o-mini` with `agents/prompts/guardrails.md`) — broader policy enforcement; optionally revises the draft

Flags are typed as `"pii" | "secret" | "internal_leak"` with severity `"warn"` or `"block"`. Results are persisted on `InvestigationRun.guardrailsResult` (JSON) and surfaced via `guardrails-badge` in the investigation trace view.

---

## Incident Clustering

Ticket creation fires `"ticket/created"` via Inngest, which triggers `clusterTicketsFunction`.

**Heuristic:** Group open/in-progress tickets by `(product, category, region)` opened within a 4-hour sliding window. Groups of 2+ become `Incident` records automatically.

```
ticket/created event
  └─► clusterTicketsFunction
        └─ lib/incident-clustering.ts::suggestClusters()
             ├─ Fetch open tickets without incident links
             ├─ Group by product + category + region
             ├─ Sliding 4h window — find groups of ≥ 2
             └─ Auto-create/update Incident records
```

Manual clustering is also available at `/api/incidents/suggest` (GET) and `/incidents` admin UI.

---

## Eval System

Eval runs execute the full agent graph directly (bypassing Inngest) against a set of golden `EvalExample` records, then score outputs with an LLM judge.

**Scoring dimensions** (via `gpt-4o-mini`):
| Dimension | Weight |
|---|---|
| Root cause accuracy | 35% |
| Evidence quality | 25% |
| Response tone | 20% |
| No hallucinations | 20% |

**Bootstrap workflow:**
```bash
# After several approved investigations:
npx tsx scripts/export-eval-data.ts   # → creates EvalExample rows

# Run eval:
npx tsx scripts/run-eval.ts --name nightly-v1
```

Results visible at `/eval` (pass rate trend) and `/eval/[runId]` (per-example breakdown).

---

## Database Schema

```
Customer
  id, name, email (unique), company, plan, region, industry, accountAge, orgId
  └── has many Ticket

Ticket
  id, externalId (unique), title, description
  status: "open" | "in_progress" | "resolved" | "archived"
  severity: "critical" | "high" | "medium" | "low"
  category?, product?, customerId, orgId
  └── belongs to Customer
  └── has many InvestigationRun
  └── has many IncidentTicket

InvestigationRun
  id, ticketId, orgId
  status: "pending" | "running" | "awaiting_approval" | "complete" | "failed"
  approvalStatus: "pending" | "approved" | "rejected" | "timeout"
  hypotheses: Json?           ← Hypothesis[] from root-cause-agent
  summary: String?            ← drafted customer reply
  escalationNote: String?
  guardrailsPassed: Boolean
  guardrailsResult: Json?
  editedReply: String?        ← reviewer-edited version
  reviewerNote: String?
  approvedAt?, approvedBy?
  startedAt, completedAt?, errorMessage?
  └── has many AgentStep
  └── has many ApprovalAudit

AgentStep
  id, investigationRunId, agentName
  status: "pending" | "running" | "complete" | "failed"
  input: Json?, output: Json?
  tokenUsage: Json?           ← { promptTokens, completionTokens, totalTokens }
  toolsCalled: String[]
  confidenceScore: Float?
  startedAt, completedAt?, durationMs?, errorMessage?

ApprovalAudit
  id, investigationRunId, action, actorId
  originalDraft, finalDraft, note?
  createdAt

KnowledgeChunk
  id, sourcePath, chunkIndex (unique together)
  content: String
  embedding: vector(1536)     ← requires raw SQL

Incident
  id, title, description, status, severity
  affectedCount, internalTimeline: Json
  createdAt, resolvedAt?
  └── has many IncidentTicket

IncidentTicket
  incidentId, ticketId        ← join table

IntegrationConfig
  id, name, enabled, webhookUrl?, metadata: Json?

EvalExample
  id, input: Json, expectedOutput: Json, tags: String[]
  createdAt, source?

EvalRun
  id, name, passRate, totalExamples, passedExamples
  startedAt, completedAt?
  └── has many EvalResult

EvalResult
  id, evalRunId, evalExampleId
  rootCauseScore, evidenceScore, toneScore, hallucinationScore
  passed, rawOutput: Json?
```

---

## RAG Pipeline

```
npm run ingest
  └─ scripts/ingest-docs.ts
       ├─ Walk knowledge-base/**/*.md
       ├─ Split into ~2000 char chunks (paragraph-aware)
       └─ For each chunk:
            ├─ embedText() → float[1536] (text-embedding-3-small)
            └─ Upsert into KnowledgeChunk via prisma.$executeRaw
                 (key: [sourcePath, chunkIndex])

Query time (knowledge-agent.ts):
  ├─ embedText(ticketSummary) → float[1536]
  ├─ searchKnowledge(embedding, topK=15)  ← pgvector cosine (<=>)
  └─ rerankChunks(query, chunks)          ← HF cross-encoder → top 5
       └─ 5-min in-memory cache; falls back to pgvector order if key absent
```

---

## Setup

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + pgvector)
- OpenAI API key
- Clerk account

### 1. Clone and install

```bash
git clone <repo>
cd signal-ops-ai-v1
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Required vars:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/support_platform
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
OPENAI_API_KEY=sk-...
INNGEST_EVENT_KEY=local
```

### 3. Start local database

```bash
docker compose up -d
```

### 4. Apply schema and seed data

```bash
npm run db:push      # creates tables + enables pgvector
npm run seed         # inserts 10 demo customers + 7 tickets
npm run ingest       # embeds knowledge-base/ into pgvector (requires OPENAI_API_KEY)
```

### 5. Start Inngest dev server (separate terminal)

```bash
npx inngest-cli@latest dev
```

### 6. Start the app

```bash
npm run dev          # http://localhost:3000
```

---

## Key Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npx tsc --noEmit` | Type-check |
| `npm run db:push` | Sync Prisma schema → DB (dev) |
| `npm run db:migrate` | Create versioned migration |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:studio` | Open Prisma Studio |
| `npm run seed` | Seed demo data |
| `npm run ingest` | Embed knowledge base |
| `npm run reset` | Full demo reset (clear + re-seed + re-ingest) |
| `npm run knowledge:fetch` | Fetch/cache external docs |
| `npm run knowledge:seed` | Fetch + embed external docs |
| `npx tsx scripts/run-eval.ts --name <name>` | Run eval suite |
| `npx tsx scripts/export-eval-data.ts` | Bootstrap EvalExample rows from approved runs |

---

## Optional Integrations

All integrations fall back to mock adapters when env vars are absent — no code changes needed.

| Variable | Effect |
|---|---|
| `HUGGING_FACE_API_KEY` | Enables HF cross-encoder reranker (fallback: pgvector order) |
| `SLACK_WEBHOOK_URL` | Slack notifications on approval (fallback: console.log) |
| `SENTRY_AUTH_TOKEN` | Real Sentry error events in incident correlation (fallback: mock) |
| `DATADOG_API_KEY` | Real Datadog log enrichment (fallback: mock logs) |
| `ZENDESK_API_TOKEN` + `ZENDESK_SUBDOMAIN` | Zendesk ticket import webhook (fallback: mock) |
| `GITHUB_TOKEN` + `GITHUB_ESCALATION_REPO` | Escalation agent creates GitHub Issues |
| `JIRA_API_TOKEN` + `JIRA_BASE_URL` + `JIRA_PROJECT_KEY` | Escalation agent creates Jira tickets |
| `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` | Required in production (default: `"local"` in dev) |

---

## Demo Tickets

The seed includes 7 tickets with predictable investigation outcomes:

| Ticket | Root Cause | Key Signal |
|---|---|---|
| TKT-001 | DB replica lag in us-east-1 | Slow query logs + inc_001 incident |
| TKT-002 | SAML cert rotation failure in EU | Auth logs + deploy_002 + inc_002 |
| TKT-003 | PgBouncer pool exhaustion after scale-up | Connection pool logs + deploy_003 |
| TKT-004 | Webhook header renamed in v3.1.2 | Signature errors + deploy_004 |
| TKT-005 | API key regional propagation delay | Billing logs + deploy_005 |
| TKT-006 | Rate limiter burst counter bug | Rate limit logs + deploy_007 + inc_003 |
| TKT-007 | Missing `SECRETS_MANAGER_KEY` in CI action v3.2.0 | Deployment logs + deploy_006 |
