# AI Support Operations Platform

A portfolio-grade multi-agent AI system for automated support ticket investigation. When a support ticket is submitted, a LangGraph-orchestrated pipeline of specialized AI agents runs in the background — classifying the ticket, analyzing logs, retrieving relevant runbooks via RAG, correlating incidents and deployments, generating root-cause hypotheses, drafting a customer reply, enforcing guardrails, and routing through a human-in-the-loop approval queue before delivery.

Built with Next.js 15, LangGraph.js, Inngest, Prisma + pgvector, and Clerk. Ships with a production RAG knowledge base (heading-aware chunking, HuggingFace cross-encoder reranking, `[KB-N]` citation labels wired through every agent), a full eval system, incident clustering, real-time agent telemetry, adapter-based external integrations (Slack, Sentry, Datadog, Zendesk), and a Devin AI integration for automated bug reproduction and code fixes.

> **New to the platform?** Read the full **[User Manual](docs/USER_MANUAL.md)** for a guided tour of every screen and feature.

**In this article**

- [Demo Walkthrough](#demo-walkthrough)
- [Tech Stack](#tech-stack)
- [File Structure](#file-structure)
- [Authentication Flow](#authentication-flow)
- [Agent Pipeline Data Flow](#agent-pipeline-data-flow)
- [HITL Approval Flow](#hitl-approval-flow)
- [Guardrails](#guardrails)
- [Incident Clustering](#incident-clustering)
- [Devin AI Integration](#devin-ai-integration)
- [Eval System](#eval-system)
- [Database Schema](#database-schema)
- [RAG Knowledge Base](#rag-knowledge-base)
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
11. Browse the Knowledge Library at `/knowledge` — search, filter by source type, view documents with LLM summaries and chunk content
12. On any ticket detail page, the **Knowledge Context** panel auto-retrieves relevant articles and runbooks with `[KB-N]` citation labels and similarity score bars; manual search available inline
13. On a completed investigation, click **"Reproduce with Devin"** → Devin reproduces the bug in a sandboxed session → verdict appears in Mission Control
14. After approving an investigation, click **"Send to Devin (Fix)"** → Devin creates a branch, implements a fix, opens a PR → PR link appears on the task card

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
│   │   ├── knowledge/
│   │   │   ├── page.tsx              # Knowledge Library — search + source-type filter
│   │   │   └── [id]/page.tsx         # Document detail — metadata, summary, chunks
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
│       ├── devin/
│       │   └── tasks/                # GET list, POST create
│       │       └── [taskId]/
│       │           ├── route.ts      # GET — single task detail
│       │           ├── cancel/       # POST — cancel task + stop Devin session
│       │           └── message/      # POST — send message to Devin session
│       ├── integrations/
│       │   ├── devin/test/           # POST — test Devin API connection
│       │   ├── slack/test/           # POST — test Slack webhook
│       │   └── zendesk/
│       │       ├── simulate/         # GET — create demo ticket via Zendesk mock
│       │       └── import/           # POST — Zendesk webhook receiver
│       ├── eval/
│       │   ├── runs/route.ts         # GET list, POST trigger
│       │   ├── runs/[id]/route.ts    # GET single run with results
│       │   └── examples/route.ts     # GET list, POST create
│       ├── knowledge/
│       │   ├── documents/route.ts    # GET — list with sourceType/productArea/q filters
│       │   ├── documents/[id]/route.ts  # GET — single doc with chunks
│       │   ├── retrieve/route.ts     # POST — ad-hoc retrieval (returns evidence + optional [KB-N] block)
│       │   └── ingest/route.ts       # POST — admin: trigger background ingestion
│       ├── tickets/[ticketId]/
│       │   └── retrieve-context/route.ts  # POST — auto-retrieve context for a ticket
│       ├── search/route.ts           # GET — pgvector RAG search (legacy)
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
│   ├── knowledge/
│   │   ├── knowledge-library.tsx     # Debounced search + source-type sidebar filter (client)
│   │   ├── knowledge-document-detail.tsx  # Doc view: metadata, summary, collapsible chunks (client)
│   │   ├── ticket-context-panel.tsx  # Auto-retrieve + manual search panel on ticket detail (client)
│   │   └── source-type-badge.tsx     # Colour-coded badge for all 8 source types
│   ├── devin/
│   │   ├── reproduce-button.tsx      # "Reproduce with Devin" button + confirmation (client)
│   │   ├── fix-button.tsx            # "Send to Devin (Fix)" button + warning dialog (client)
│   │   ├── devin-task-card.tsx       # Task status, verdict, PR link, cancel/message (client)
│   │   └── devin-tasks-section.tsx   # List of DevinTaskCards for an investigation (client)
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
│   └── functions.ts                  # runInvestigationFunction (HITL) + clusterTicketsFunction + pollDevinTaskFunction
│
├── lib/
│   ├── db.ts                         # Prisma client singleton (hot-reload safe)
│   ├── auth.ts                       # requireAuth() + requireOrgAuth()
│   ├── env.ts                        # Zod-validated env vars (server-only)
│   ├── embeddings.ts                 # embedText() — text-embedding-3-small
│   ├── vector-search.ts              # searchKnowledge(), searchKnowledgeFiltered(), searchKnowledgeKeyword()
│   ├── knowledge-chunker.ts          # Heading-aware markdown chunker (~3200 chars, ~600 overlap)
│   ├── knowledge-retrieval.ts        # Full retrieval pipeline: embed → filter → rerank → [KB-N] labels
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
│       ├── zendesk/{mock,index}.ts
│       └── devin/
│           ├── types.ts             # DevinSession, IDevinAdapter, status mapping, Zod schemas
│           ├── client.ts            # Live Devin API client (Bearer auth, 30s timeouts)
│           ├── mock.ts              # Mock adapter (deterministic state cycling)
│           ├── index.ts             # Factory: live if DEVIN_API_KEY set, mock otherwise
│           ├── prompt-builder.ts    # buildReproductionPrompt(), buildFixPrompt() with PII redaction
│           └── result-parser.ts     # parseDevinResult() with structured output → message → status fallback
│
├── prisma/
│   ├── schema.prisma                 # All models
│   └── seed.ts
│
├── scripts/
│   ├── seed-db.ts                    # Insert demo customers + tickets
│   ├── ingest-docs.ts                # Embed knowledge-base/ into pgvector (legacy)
│   ├── reset-demo.ts                 # Clear + re-seed + re-ingest
│   ├── knowledge-ingest.ts           # Parse front-matter, chunk, embed → KnowledgeDocument + KnowledgeChunk
│   ├── knowledge-reset.ts            # Delete managed knowledge docs/chunks (preserves legacy)
│   ├── knowledge-evaluate.ts         # Retrieval eval: hit@1/3/5 against golden query set
│   ├── run-eval.ts                   # CLI eval runner
│   └── export-eval-data.ts           # Bootstrap EvalExample rows from approved runs
│
├── docs/
│   └── USER_MANUAL.md                # "A User's Manual: Getting To Know The Support Buddy X9000"
│
├── __tests__/                        # Unit tests (Vitest)
│   ├── utils.test.ts
│   ├── guardrails-rules.test.ts
│   ├── agent-utils.test.ts
│   ├── devin-prompt-builder.test.ts
│   ├── devin-result-parser.test.ts
│   ├── devin-mock.test.ts
│   ├── devin-types.test.ts
│   └── ui/
│       ├── devin-task-card.test.tsx
│       └── devin-reproduce-button.test.tsx
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
├── knowledge-base/                   # Legacy RAG source documents (Markdown, ingest-docs.ts)
│   ├── runbooks/
│   ├── product-docs/
│   └── internal-notes/
│
├── knowledge/                        # Managed knowledge base (knowledge-ingest.ts)
│   ├── runbooks/
│   ├── product-docs/
│   ├── architecture-docs/
│   ├── incident-reports/
│   ├── support-tickets/
│   └── evals/
│       └── retrieval-eval.json       # Golden query set for hit@K evaluation
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

## Devin AI Integration

The platform integrates with [Cognition AI's Devin](https://devin.ai) to provide automated bug reproduction and narrowly scoped code fixes after human authorization.

### Architecture

```
Investigation completes
  │
  ├─ User clicks "Reproduce with Devin"
  │    └─► POST /api/devin/tasks { mode: "reproduce" }
  │         ├─ Build prompt from investigation context (hypotheses, logs, KB chunks, deployments)
  │         ├─ Create DevinTask (status: "queued") + WorkItem
  │         └─ Fire Inngest "devin/task.created"
  │              └─► pollDevinTaskFunction
  │                   ├─ Step 1: Create Devin session via API
  │                   ├─ Step 2: Poll every 2min (max 90 polls / ~3h)
  │                   │    └─ Update status, verdict, PR URL on each poll
  │                   └─ Step 3: Parse final result + complete WorkItem
  │
  └─ After approval: User clicks "Send to Devin (Fix)" (admin only)
       └─► Same flow but with mode: "fix"
            ├─ Prompt includes approved reply, reviewer notes, PR authorization
            └─ Devin creates branch + opens PR (auto-merge NOT authorized)
```

### Modes

| Mode | Trigger | Authorization | Output |
|------|---------|--------------|--------|
| **Reproduce** | Investigation complete or awaiting approval | Any authenticated user | Verdict (REPRODUCED / UNABLE_TO_REPRODUCE / etc.) |
| **Fix** | Investigation approved | Admin role required | Pull Request URL |

### Security

- Prompts wrap all ticket/log/KB content in `--- BEGIN UNTRUSTED EVIDENCE ---` / `--- END UNTRUSTED EVIDENCE ---` delimiters with explicit injection warnings
- PII (email, phone) redacted from customer context before prompt construction
- No production credentials sent to Devin; no auto-merge capability
- `DEVIN_API_KEY` accessed server-side only via `lib/env.ts`
- All state changes produce `WorkItemEvent` audit trail records

### Mock Mode

When `DEVIN_API_KEY` is not set, the mock adapter simulates sessions that cycle `working → working → finished` with deterministic verdicts. No external API calls are made.

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

KnowledgeDocument
  id, title, sourceType, sourceName, sourceUrl?
  productArea?, tags: String[]
  summary?                    ← optional LLM-generated summary
  filePath (unique)
  createdAt, updatedAt
  └── has many KnowledgeChunk

KnowledgeChunk
  id, sourcePath, chunkIndex (unique together)
  documentId?                 ← null for legacy chunks (ingest-docs.ts)
  heading?                    ← active heading at chunk start
  tokenCount?
  content: String
  embedding: vector(1536)     ← requires raw SQL

RetrievalResult
  id, query, ticketId?, investigationRunId?
  chunkIds: String[]          ← returned chunk IDs
  scores: Json                ← { chunkId → score } map
  createdAt

Incident
  id, title, description, status, severity
  affectedCount, internalTimeline: Json
  createdAt, resolvedAt?
  └── has many IncidentTicket

IncidentTicket
  incidentId, ticketId        ← join table

DevinTask
  id, orgId, devinSessionId (unique), sessionUrl, repository, branch?
  mode: "reproduce" | "fix"
  status: "queued" | "creating" | "working" | "blocked" | "waiting" | "pr_ready" | "finished" | "failed" | "expired" | "cancelled"
  promptSnapshot: Json, structuredResult: Json?
  pullRequestUrl?, verdict?, verdictReason?, errorMessage?
  pollCount, lastPolledAt?, startedAt?, completedAt?
  createdBy                   ← Clerk userId
  ticketId?, investigationRunId?, workItemId? (unique)
  └── belongs to Ticket?, InvestigationRun?, WorkItem?

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

## RAG Knowledge Base

### Sources

| Source type | Description |
|---|---|
| `RUNBOOK` | Step-by-step operational runbooks |
| `INCIDENT_REPORT` | Post-mortems and incident summaries |
| `SUPPORT_TICKET` | Historical resolved support tickets |
| `PRODUCT_DOC` | Product feature documentation |
| `ARCHITECTURE_DOC` | System design and architecture notes |
| `EXTERNAL_DOC` | Third-party vendor documentation |
| `ALERT` | Alert rule definitions |
| `LOG_SUMMARY` | Log pattern summaries |

Source documents are Markdown files in `knowledge/` with optional front-matter:

```markdown
**Source Type:** RUNBOOK
**Source Name:** Database Failover Runbook
**Tags:** database, failover, postgres
**Product Area:** Infrastructure
```

### Ingestion Pipeline

```
npm run knowledge:ingest
  └─ scripts/knowledge-ingest.ts
       ├─ Walk knowledge/**/*.md
       ├─ Parse front-matter → sourceType, tags, productArea, sourceName
       ├─ lib/knowledge-chunker.ts — heading-aware chunker
       │    ├─ Strip front-matter header lines
       │    ├─ Split on headings + ~3200 char target (~800 tokens)
       │    ├─ ~600 char overlap between chunks
       │    └─ Prepend active heading to each chunk
       ├─ Upsert KnowledgeDocument (key: filePath)
       └─ For each chunk:
            ├─ embedText() → float[1536] (text-embedding-3-small)
            └─ Upsert KnowledgeChunk via prisma.$executeRaw
                 (key: [sourcePath, chunkIndex])
```

### Retrieval Pipeline

```
lib/knowledge-retrieval.ts::retrieveKnowledge(query, options)
  │
  ├─ embedText(query) → float[1536]
  ├─ searchKnowledgeFiltered(embedding, topK=15, filters?)
  │    └─ pgvector cosine (<=>), LEFT JOIN KnowledgeDocument
  │         optional WHERE: sourceType IN (...), tags @>, productArea =
  ├─ Filter by minScore threshold (default 0.25)
  ├─ searchKnowledgeKeyword() fallback if < 3 results
  │    └─ PostgreSQL plainto_tsquery full-text search
  ├─ rerankChunks(query, candidates) — HF cross-encoder
  │    └─ 5-min in-memory cache; falls back to pgvector order if key absent
  ├─ Assign [KB-1] … [KB-N] citation labels
  └─ Write RetrievalResult audit row (skippable via skipAudit: true)
```

### Agent Integration

Every agent that uses knowledge evidence receives a formatted citation block:

```
[KB-1] Database Failover Runbook (RUNBOOK · Infrastructure)
> Step 3: Promote the replica using pg_promote()...

[KB-2] Incident Report: DB Lag June 2024 (INCIDENT_REPORT)
> Root cause was a stale checkpoint on the primary...
```

Agents (`knowledge-agent`, `root-cause-agent`, `response-agent`) are instructed via their prompts to reference `[KB-N]` labels in hypotheses, evidence arrays, and customer-facing replies.

### UI

- **`/knowledge`** — searchable, filterable library of all indexed documents; source-type sidebar; document cards with tag chips, chunk count, and relative timestamp
- **`/knowledge/[id]`** — full document view with LLM summary, metadata header, and collapsible per-chunk accordion showing heading context and token counts
- **Ticket Context Panel** — on every ticket detail page, auto-retrieves the top 8 relevant articles on load; groups results into Runbooks / Incidents & Tickets / Docs & Guides / Alerts & Logs; shows `[KB-N]` label, colour-coded score bar, excerpt, and expand toggle; supports inline manual search

### Retrieval Evaluation

```bash
npm run knowledge:evaluate
  └─ scripts/knowledge-evaluate.ts
       ├─ Reads knowledge/evals/retrieval-eval.json (golden query set)
       ├─ Runs retrieveKnowledge() at limit=5, minScore=0.0 per query
       ├─ Case-insensitive substring title matching
       └─ Reports hit@1 / hit@3 / hit@5 + miss report
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
npm run db:push            # creates tables + enables pgvector
npm run seed               # inserts 10 demo customers + 7 tickets
npm run ingest             # embeds legacy knowledge-base/ into pgvector (requires OPENAI_API_KEY)
npm run knowledge:ingest   # chunks + embeds knowledge/ → KnowledgeDocument + KnowledgeChunk
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
| `npm run ingest` | Embed legacy knowledge-base/ into pgvector |
| `npm run reset` | Full demo reset (clear + re-seed + re-ingest) |
| `npm run knowledge:ingest` | Chunk + embed knowledge/ → KnowledgeDocument + KnowledgeChunk |
| `npm run knowledge:reset` | Delete managed knowledge docs/chunks (preserves legacy) |
| `npm run knowledge:evaluate` | Retrieval eval: hit@1/3/5 against golden query set |
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
| `DEVIN_API_KEY` | Automated bug reproduction and code fixes via Cognition AI (fallback: mock adapter) |
| `DEVIN_DEFAULT_REPO` | Default repository URL for Devin tasks (e.g. `https://github.com/your-org/your-repo`) |
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
