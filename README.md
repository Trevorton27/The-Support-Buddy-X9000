# The Support Buddy X9000

An agentic AI platform that autonomously investigates support tickets, reproduces bugs, and submits code fixes — with human oversight at every critical decision point.

When a support ticket arrives, a LangGraph-orchestrated pipeline of 9 specialized AI agents runs in the background: classifying the issue, analyzing logs, retrieving runbooks via RAG, correlating incidents and deployments, generating root-cause hypotheses, drafting a customer reply, enforcing guardrails, and routing through human-in-the-loop approval. After approval, **Devin AI** can autonomously reproduce the bug in a sandboxed environment and submit a pull request with the fix.

![Dashboard Overview](docs/screenshots/dashboard-overview.png)

---

**In this article**

- [Agentic AI Architecture](#agentic-ai-architecture)
- [Devin AI Integration](#devin-ai-integration)
- [Demo Lab](#demo-lab)
  - [How to Create a Demo Event and Run an Investigation](#how-to-create-a-demo-event-and-run-an-investigation)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [End-to-End Walkthrough](#end-to-end-walkthrough)
- [Agent Pipeline](#agent-pipeline)
- [HITL Approval Flow](#hitl-approval-flow)
- [Guardrails](#guardrails)
- [GitHub Issue Sync](#github-issue-sync)
- [Mission Control](#mission-control)
- [Incident Clustering](#incident-clustering)
- [RAG Knowledge Base](#rag-knowledge-base)
- [Eval System](#eval-system)
- [Database Schema](#database-schema)
- [File Structure](#file-structure)
- [Setup](#setup)
- [Key Commands](#key-commands)
- [Optional Integrations](#optional-integrations)

---

## Agentic AI Architecture

The platform is built around **three layers of autonomous AI agents** that collaborate to resolve support issues end-to-end:

### Layer 1: Investigation Agents (LangGraph)

Nine specialized agents run as a directed acyclic graph, each with a single responsibility:

```
Ticket submitted
  |
  v
[Intake Agent] --> classify severity, category, product
  |
  v
[Customer Context Agent] --> fetch account history, plan tier, region
  |
  +--> [Log Analysis Agent] -----------> error patterns, stack traces (+ Datadog)
  +--> [Knowledge Agent] --------------> RAG search + HF reranker --> [KB-N] citations
  +--> [Incident Correlation Agent] ---> match past incidents (+ Sentry)
  +--> [Deployment Correlation Agent] -> recent deploys near issue window
  |
  v  (all 4 run in parallel)
[Root Cause Agent] --> rank hypotheses with confidence scores
  |
  v
[Response Agent] --> draft customer-facing reply with [KB-N] citations
  |
  v
[Guardrails Agent] --> PII/secret detection + policy enforcement
  |
  v
[Escalation Agent] --> internal notes, optional GitHub/Jira issue
```

Every agent creates an auditable `AgentStep` record with token usage, timing, tools called, and confidence scores — viewable in the real-time investigation trace. A total token usage badge on the investigation detail page aggregates usage and estimated cost across all agent steps.

### Layer 2: Devin AI (Autonomous Coding Agent)

After investigation, Devin AI takes over for code-level work:
- **Reproduce**: Validates the bug exists in the codebase
- **Fix**: Creates a branch, implements the fix, opens a PR
- **Author Defects**: Generates realistic bugs for testing the pipeline

### Layer 3: Mission Control (Work Orchestration)

An AI-powered work queue that processes signals from all sources, prioritizes work items, and provides shift briefings — ensuring nothing falls through the cracks.

---

## Devin AI Integration

The platform integrates with [Cognition AI's Devin](https://devin.ai) to close the loop from support ticket to code fix — fully autonomously, with human authorization gates.

![Devin AI Dashboard](docs/screenshots/devin-dashboard.png)

### How It Works

```
Investigation completes
  |
  |-- User clicks "Reproduce with Devin"
  |     |
  |     v
  |   POST /api/devin/tasks { mode: "reproduce" }
  |     |-- Build prompt from investigation context
  |     |   (hypotheses, logs, KB chunks, deployments)
  |     |-- Create DevinTask (status: "queued") + WorkItem
  |     |-- Fire Inngest "devin/task.created"
  |     v
  |   pollDevinTaskFunction (Inngest)
  |     |-- Step 1: Create Devin session via API
  |     |-- Step 2: Poll every 2min (max 90 polls / ~3h)
  |     |   Update status, verdict, PR URL on each poll
  |     |-- Step 3: Parse result + complete WorkItem
  |     v
  |   Verdict: REPRODUCED / UNABLE_TO_REPRODUCE / etc.
  |
  |-- After approval: User clicks "Send to Devin (Fix)"
        |
        v
      Same flow with mode: "fix"
        |-- Prompt includes approved reply, reviewer notes
        |-- Devin creates branch + opens PR
        v
      Pull Request on support-buddy-demo-product
```

![Reproduce with Devin](docs/screenshots/devin-reproduce.png)

### Three Modes

| Mode | Trigger | Who Can Use | Output |
|------|---------|-------------|--------|
| **Reproduce** | Investigation complete | Any authenticated user | Verdict (REPRODUCED, UNABLE_TO_REPRODUCE, etc.) |
| **Fix** | Investigation approved | Admin only | Pull Request URL |
| **Author Defect** | Demo Lab wizard | Admin only | New bug scenario with regression test |

### Devin Dashboard (`/devin`)

A dedicated monitoring page with:
- **Stats grid**: Total tasks, active, finished, failed, reproduced, fixes submitted, avg polls
- **Filter bar**: All / Active / Reproduce / Fix / Author / Finished / Failed
- **Expandable task rows**: Status badges, verdict, session links, PR links, message/cancel actions

![Devin Task with PR](docs/screenshots/devin-fix-pr.png)

### PR Traceability

Devin PRs are automatically linked back to their originating support ticket:

- **Branch name**: `fix/<ticketId>-<slugified-title>` (e.g. `fix/cmugtskq-billing-api-key-rotation`)
- **PR title**: `fix: [<ticketId>] <ticket subject>` (e.g. `fix: [cmugtskq] Billing API key rotation causing auth failures`)
- **PR body**: includes `Ticket: <ticketId>` reference and `Closes #<githubIssueNumber>` to auto-close the linked GitHub issue on merge
- Both reproduce and fix prompts include the ticket ID and GitHub issue number in the evidence context

### Security

- All ticket/log/KB content wrapped in `--- BEGIN UNTRUSTED EVIDENCE ---` / `--- END UNTRUSTED EVIDENCE ---` delimiters with injection warnings
- PII (email, phone) redacted from customer context before prompt construction
- No production credentials sent to Devin; no auto-merge capability
- `DEVIN_API_KEY` accessed server-side only via `lib/env.ts`
- All state changes produce `WorkItemEvent` audit trail records

### Mock Mode

When `DEVIN_API_KEY` is not set, the mock adapter simulates sessions that cycle `working -> working -> finished` with deterministic verdicts. No external API calls are made.

---

## Demo Lab

The Demo Lab provides a controlled environment for end-to-end testing of the entire agentic pipeline — from bug injection through investigation to Devin-powered fix.

![Demo Lab](docs/screenshots/demo-lab.png)

### Scenario Lifecycle

```
[Available] --activate--> [Broken] --create_ticket--> [Ticket Open]
    |                                                       |
    |                                              --investigate-->
    |                                                       |
    |                                              [Investigating]
    |                                                       |
    |                                           [Awaiting Approval]
    |                                                       |
    |                                          [Devin Reproducing]
    |                                                       |
    |                                            [Devin Fixing]
    |                                                       |
    |                                              [PR Ready]
    |                                                       |
    +<--------------------reset-----------------------[Fixed]
```

### Features

- **Activate Issue**: Injects a real code defect into the demo product repo
- **Run Entire Demo**: One-click orchestration of the full lifecycle via Inngest
- **Mutate**: LLM-powered variation of existing scenarios (GPT-4o generates novel bugs)
- **Devin: Author Defect**: Multi-step wizard that dispatches Devin to create new defects with regression tests and manifest files
- **GitHub Issue Sync**: Every ticket auto-creates a rich GitHub issue on the demo product repo

### Defect Author Wizard

A guided flow for creating AI-authored bugs:

1. **Select service** (auth, webhook, order, billing, rate-limiter, database)
2. **Choose defect class** (off-by-one, race condition, missing null check, stale cache, etc.)
3. **Set difficulty** (easy / medium / hard)
4. **Add guidance** (optional natural language instructions)
5. **Confirm and dispatch** to Devin

### How to Create a Demo Event and Run an Investigation

There are three ways to inject a defect and trigger the full investigation pipeline:

#### Option 1: One-Click Full Demo (Recommended)

1. Navigate to `/demo-lab`
2. Find a scenario card with status **Available**
3. Click **"Run Entire Demo"** — this fires a single Inngest event (`demo-lab/run.requested`) that orchestrates everything automatically:
   - Injects the defect patch into a git branch on the demo product repo
   - Creates a support ticket from the scenario's template
   - Runs the full 9-agent investigation pipeline
   - Waits for your HITL approval (up to 72h)
   - Dispatches Devin to reproduce the bug
   - Dispatches Devin to fix the bug and open a PR
   - Reverts the demo product to a clean state when done
4. Monitor progress on the scenario card — status transitions through `Broken → Ticket Open → Investigating → Awaiting Approval → Devin Reproducing → Devin Fixing → PR Ready → Fixed`
5. When it reaches **Awaiting Approval**, go to `/approvals` to review and approve

#### Option 2: Step-by-Step Manual Flow

1. **Activate a scenario**: On `/demo-lab`, click **"Activate Issue"** on any available scenario. This injects the defect into a feature branch on the demo product repo
2. **Create the ticket**: Click **"Create Ticket"** on the now-broken scenario. This creates a support ticket using the scenario's template and fires a `ticket/created` event (which also auto-creates a GitHub issue)
3. **Run the investigation**: Go to `/tickets`, open the new ticket, and click **"Run Investigation"**. Watch the agents work in real time at `/investigations/[runId]`
4. **Approve**: Once the investigation reaches `awaiting_approval`, go to `/approvals/[runId]`. Edit the draft reply if needed, add reviewer notes, then approve
5. **Reproduce with Devin**: Back on the investigation page, click **"Reproduce with Devin"**. Monitor the session at `/devin`
6. **Fix with Devin**: After approval, click **"Send to Devin (Fix)"**. Devin creates a branch and opens a PR on the demo product repo
7. **Reset**: Click **"Reset"** on the scenario card to revert the demo product and make the scenario available again

#### Option 3: Generate a New Scenario

To create an entirely new defect (not from the pre-built seeds):

- **Mutate an existing scenario**: Click **"Mutate"** on any scenario card. GPT-4o generates a novel variation of the bug with a new patch, ticket template, and verification gate
- **Author with Devin**: Click **"Author Defect"** in the Demo Lab header. A multi-step wizard lets you choose a service, defect class (off-by-one, race condition, etc.), difficulty, and optional guidance. Devin then creates the bug, a regression test, and a scenario manifest in the demo product repo
- **Generate via dialog**: Click **"Generate Scenario"** to create a new scenario template via LLM

#### Prerequisites

- Inngest must be running: `npx inngest-cli@latest dev -u http://localhost:3000/api/webhooks/inngest` (local) or Inngest Cloud with correct `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (production)
- For real Devin sessions: set `DEVIN_API_KEY` in `.env.local` (without it, the mock adapter simulates sessions)
- For GitHub issue sync: configure GitHub App credentials or set `GITHUB_TOKEN`
- Defect injection works two ways: locally if the demo product repo is cloned at `../support-buddy-demo-product` (or `DEMO_PRODUCT_REPO_PATH`), or remotely via the GitHub API using `GITHUB_TOKEN` (required for Vercel deployments)

---

## Screenshots

| View | Description |
|------|-------------|
| ![Dashboard](docs/screenshots/dashboard-overview.png) | **Dashboard** — KPI overview with ticket volume, resolution times, and agent performance |
| ![Investigation](docs/screenshots/investigation-pipeline.png) | **Investigation Pipeline** — Real-time agent trace with clickable steps, per-step and total token usage, timing bar, and evidence panel |
| ![Devin Dashboard](docs/screenshots/devin-dashboard.png) | **Devin AI Dashboard** — Monitor all Devin sessions with stats, filters, and expandable task details |
| ![Approval Queue](docs/screenshots/approval-queue.png) | **Approval Queue** — HITL review with SLA timers, customer tier badges, and draft editor |
| ![Mission Control](docs/screenshots/mission-control.png) | **Mission Control** — AI-prioritized work queue with shift briefings and responsibility tracking |
| ![Demo Lab](docs/screenshots/demo-lab.png) | **Demo Lab** — Scenario cards with one-click activation, full demo orchestration, and mutation |
| ![GitHub Sync](docs/screenshots/github-issue-sync.png) | **GitHub Issue Sync** — Tickets auto-create rich GitHub issues with reproduction steps and acceptance criteria |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Auth | Better Auth (self-hosted, `better-auth`) with Organizations |
| Agent orchestration | LangGraph.js (`@langchain/langgraph`) |
| Autonomous coding | Devin AI (Cognition) |
| LLM | OpenAI `gpt-4o` (reasoning), `gpt-4o-mini` (classification / guardrails / eval) |
| Embeddings | OpenAI `text-embedding-3-small` (1536d) |
| Reranker | HuggingFace Inference API (`cross-encoder/ms-marco-MiniLM-L-6-v2`) |
| Background jobs | Inngest v3 |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 6 |
| UI | shadcn/ui (Radix primitives) + Tailwind CSS v3 |
| Validation | Zod |

---

## End-to-End Walkthrough

1. **Sign in** -- email + password with visibility toggle, redirected to `/dashboard` (KPI overview)
2. **Browse tickets** at `/tickets` -- pre-seeded support tickets with customer context
3. **Click any ticket** -- view detail, customer history, knowledge context panel
4. **Run Investigation** -- fires background agent pipeline via Inngest
5. **Watch agents work** at `/investigations/[runId]` -- real-time step updates (2s polling), per-step and total token usage with cost estimates, timing bar, evidence panel, guardrails badge
6. **Review at `/approvals`** -- investigation reaches `awaiting_approval` with SLA timer
7. **Approve or reject** -- edit draft reply, add reviewer notes, one-click approve/reject
8. **Reproduce with Devin** -- click on investigation to dispatch Devin for bug reproduction
9. **Fix with Devin** -- after approval, dispatch Devin to create a branch and open a PR
10. **Monitor at `/devin`** -- track all Devin sessions, filter by mode/status, view verdicts and PR links
11. **GitHub issues auto-created** -- every ticket syncs to `support-buddy-demo-product` with full bug context
12. **Incidents auto-clustered** at `/incidents` -- P0/P1/P2 severity banners, status-page editor
13. **Demo Lab** at `/demo-lab` -- activate scenarios, run full demos, mutate bugs, author defects with Devin
14. **Mission Control** at `/mission-control` -- AI-prioritized work queue, shift briefings, responsibility tracking
15. **Eval suite** at `/eval` -- pass rate trends, per-dimension scoring across golden test cases

---

## Agent Pipeline

### Trigger

```
User clicks "Run Investigation"
  |
  v
POST /api/agents/run  { ticketId }
  |-- Verify ticket exists (Prisma)
  |-- Create InvestigationRun { status: "pending" }
  |-- inngest.send("investigation/run.requested")
  v
Return { runId } --> browser redirects to /investigations/[runId]
```

### Background Execution (Inngest + LangGraph)

```
Inngest picks up "investigation/run.requested"
  |
  v
runInvestigationFunction
  |
  Step 1: Execute graph
    intake --> customer_context
      --> parallel(log_analysis, knowledge_retrieval,
                   incident_correlation, deployment_correlation)
      --> root_cause --> response_drafting --> guardrails --> escalation
  Step 2: Set status "awaiting_approval"
  Step 3: step.waitForEvent("investigation/approval.submitted", timeout: "72h")
  Step 4: Process approval (write ApprovalAudit, post Slack, update run)
```

### Per-Agent Pattern

Every agent node follows this pattern:

```ts
// 1. Record start
const step = await prisma.agentStep.create({
  data: { investigationRunId, agentName, status: "running", input: {...} }
});

// 2. Do work (LLM call)
const response = await openai.chat.completions.create({...});
const tokenUsage = extractTokenUsage(response);

// 3. Record completion
await prisma.agentStep.update({
  where: { id: step.id },
  data: { status: "complete", output: result, tokenUsage, completedAt: new Date() }
});

// 4. Return state patch (never mutate state directly)
return { fieldName: parsedResult };
```

### Real-Time UI

```
Browser (/investigations/[runId])
  |
  AgentTimeline (Client Component)
    |-- setInterval(router.refresh, 2000) while status = "running"
    |-- Each refresh re-fetches InvestigationRun + AgentStep[]
```

![Investigation Pipeline](docs/screenshots/investigation-pipeline.png)

---

## HITL Approval Flow

```
Investigation completes
  |
  |-- Inngest sets status: "awaiting_approval"
  |-- Run appears in /approvals with SLA timer
  |
  v
Reviewer opens /approvals/[runId]
  |-- Sees original draft + editable textarea
  |-- Clicks Approve or Reject
  |
  v
POST /api/investigations/[runId]/approve
  |-- Write ApprovalAudit (original draft, final draft, reviewer note)
  |-- Update InvestigationRun (approvalStatus, editedReply, approvedAt)
  |-- inngest.send("investigation/approval.submitted")
  v
Inngest resumes --> posts Slack notification
```

![Approval Queue](docs/screenshots/approval-queue.png)

**Resilience:** The DB write happens before the Inngest event. If Inngest restarts, the UI always reflects the correct approval state.

---

## Guardrails

The `guardrails-agent` runs after `response_drafting`, before `escalation`.

**Two-pass approach:**

1. **Deterministic pass** (`lib/guardrails-rules.ts`) -- regex checks for PII (email, phone, SSN, credit card), secrets (API keys, tokens), and internal content markers
2. **LLM pass** (`gpt-4o-mini`) -- broader policy enforcement with optional draft revision

Flags are typed as `"pii" | "secret" | "internal_leak"` with severity `"warn"` or `"block"`. Results surfaced via `guardrails-badge` in the investigation trace.

---

## GitHub Issue Sync

Every ticket created in the platform automatically creates a corresponding GitHub issue on the demo product repository, giving Devin full context to work with.

![GitHub Issue Sync](docs/screenshots/github-issue-sync.png)

### How It Works

```
Ticket created (any path: UI, demo-lab, bug-generator, batch generation)
  |
  v
Inngest "ticket/created" event fires
  |
  +---> clusterTicketsFunction (incident clustering)
  +---> syncTicketToGitHubFunction (GitHub issue sync)
          |
          |-- Authenticate via GitHub App (JWT + installation token)
          |-- Query linked DemoIssueScenario for enrichment
          |-- Build rich issue body:
          |     - Bug description
          |     - Severity, category, product metadata
          |     - Affected service and file paths
          |     - Reproduction steps
          |     - Acceptance criteria (as checkboxes)
          |     - Known defect location
          |-- POST /repos/{owner}/{repo}/issues
          |-- Update Ticket with githubIssueUrl + githubIssueNumber
          v
        GitHub issue on support-buddy-demo-product
```

### Authentication

Uses a **GitHub App** (preferred) with automatic JWT signing and installation token caching, falling back to a Personal Access Token if the app is not configured.

---

## Mission Control

AI-powered work queue that unifies all operational signals into a single prioritized view.

![Mission Control](docs/screenshots/mission-control.png)

### Features

- **Work Items**: Canonical units of responsibility with a full state machine (OPEN -> IN_PROGRESS -> COMPLETED)
- **Priority Engine**: Deterministic scoring based on severity, SLA, customer tier, and staleness
- **Shift Briefings**: AI-generated workload summaries
- **Work Signals**: Immutable incoming events processed via AI action extraction
- **Responsibility Tracking**: Who owns what, with stale-work detection

---

## Incident Clustering

Ticket creation fires `"ticket/created"` via Inngest, which triggers automatic clustering.

**Heuristic:** Group open/in-progress tickets by `(product, category, region)` opened within a 4-hour sliding window. Groups of 2+ become `Incident` records automatically.

Manual clustering also available at `/incidents`.

---

## RAG Knowledge Base

### Sources

| Source Type | Description |
|---|---|
| `RUNBOOK` | Step-by-step operational runbooks |
| `INCIDENT_REPORT` | Post-mortems and incident summaries |
| `SUPPORT_TICKET` | Historical resolved support tickets |
| `PRODUCT_DOC` | Product feature documentation |
| `ARCHITECTURE_DOC` | System design and architecture notes |
| `EXTERNAL_DOC` | Third-party vendor documentation |
| `ALERT` | Alert rule definitions |
| `LOG_SUMMARY` | Log pattern summaries |

### Pipeline

```
Markdown docs in knowledge/
  |
  v
Heading-aware chunker (~3200 chars, ~600 overlap)
  |
  v
text-embedding-3-small --> float[1536]
  |
  v
pgvector cosine search --> top 15 candidates
  |
  v
HF cross-encoder reranker --> top 5
  |
  v
[KB-1] ... [KB-N] citation labels
  |
  v
Agents reference [KB-N] in hypotheses and customer replies
```

### Agent Integration

Every agent that uses knowledge evidence receives formatted citation blocks:

```
[KB-1] Database Failover Runbook (RUNBOOK - Infrastructure)
> Step 3: Promote the replica using pg_promote()...

[KB-2] Incident Report: DB Lag June 2024 (INCIDENT_REPORT)
> Root cause was a stale checkpoint on the primary...
```

---

## Eval System

Eval runs execute the full agent graph directly (bypassing Inngest) against golden `EvalExample` records, then score outputs with an LLM judge.

**Scoring dimensions** (via `gpt-4o-mini`):

| Dimension | Weight |
|---|---|
| Root cause accuracy | 35% |
| Evidence quality | 25% |
| Response tone | 20% |
| No hallucinations | 20% |

Results visible at `/eval` (pass rate trend) and `/eval/[runId]` (per-example breakdown).

---

## Database Schema

```
Customer
  id, name, email, company, plan, region, industry, orgId
  --> has many Ticket

Ticket
  id, title, description, status, severity, category, product
  githubIssueUrl, githubIssueNumber    <-- auto-synced
  --> has many InvestigationRun, DevinTask

InvestigationRun
  id, ticketId, status, approvalStatus
  hypotheses (Json), summary, editedReply, guardrailsResult (Json)
  --> has many AgentStep, ApprovalAudit

AgentStep
  id, agentName, status, input/output (Json)
  tokenUsage (Json), toolsCalled, confidenceScore, durationMs

DevinTask
  id, mode (reproduce|fix|defect_author), status, verdict
  repository, branch, sessionUrl, pullRequestUrl
  promptSnapshot (Json), structuredResult (Json)
  pollCount, createdBy
  --> belongs to Ticket, InvestigationRun, WorkItem

WorkItem
  id, type, status, title, summary, priorityScore
  --> has many WorkItemEvent

Incident
  id, title, severity (P0|P1|P2), status
  internalTimeline (Json)
  --> has many IncidentTicket

KnowledgeDocument + KnowledgeChunk
  Heading-aware chunks with vector(1536) embeddings
```

---

## File Structure

```
app/
  (dashboard)/                    # Protected route group
    dashboard/                    # KPI overview
    tickets/                      # Ticket list + detail
    investigations/               # Investigation list + trace view
    approvals/                    # HITL approval queue
    incidents/                    # Incident management
    devin/                        # Devin AI dashboard
    demo-lab/                     # Demo scenario management
    bug-generator/                # Bug injection tool
    mission-control/              # AI work queue
    knowledge/                    # Knowledge library
    generate/                     # Sample case generation
    training/                     # Agent training
    eval/                         # Eval suite
    team/                         # Org members
    settings/                     # Integration config
  api/
    agents/run/                   # Trigger investigation
    tickets/                      # CRUD + fires ticket/created
    investigations/               # List, detail, approve
    devin/tasks/                  # Devin task CRUD + cancel/message
    demo-lab/                     # Scenario actions + generation
    webhooks/
      inngest/                    # Inngest receiver
      github/                    # GitHub webhook (push, PR, checks)
      devin/                     # Devin session status updates

agents/
  graph.ts                        # LangGraph StateGraph
  state.ts                        # InvestigationState types
  nodes/                          # 9 agent implementations
  prompts/                        # System prompts (markdown)
  tools/                          # Data fetchers

components/
  agents/                         # Timeline, drawer, evidence panel
  devin/                          # Dashboard, reproduce/fix buttons, task cards
  demo-lab/                       # Scenario cards, wizard, timeline
  mission-control/                # Priority queue, work items, briefings
  approvals/                      # Queue table, reply editor
  incidents/                      # Severity banners, status editor
  knowledge/                      # Library, context panel, citations

lib/
  github-sync.ts                  # GitHub App auth + issue creation
  integrations/devin/             # Live client, mock, prompt builder, result parser
  demo-lab/                       # Lifecycle, git-ops, scenario generator, defect author
  priority-engine.ts              # Deterministic work item scoring
  signal-processor.ts             # AI action extraction
  knowledge-retrieval.ts          # Full RAG pipeline
  reranker.ts                     # HF cross-encoder
  guardrails-rules.ts             # PII/secret detection
  eval-runner.ts                  # Eval orchestration

inngest/
  functions.ts                    # All background functions:
                                  #   runInvestigationFunction (HITL)
                                  #   clusterTicketsFunction
                                  #   syncTicketToGitHubFunction
                                  #   pollDevinTaskFunction
                                  #   runDemoScenarioFunction
                                  #   + work signal/priority/briefing functions
```

---

## Setup

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + pgvector)
- OpenAI API key

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Trevorton27/The-Support-Buddy-X9000.git
cd The-Support-Buddy-X9000
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in DATABASE_URL, OPENAI_API_KEY, BETTER_AUTH_SECRET

# 3. Start local database
docker compose up -d

# 4. Apply schema and seed
npm run db:push
npm run seed
npm run ingest
npm run knowledge:ingest

# 5. Start Inngest dev server (separate terminal)
npx inngest-cli@latest dev -u http://localhost:3000/api/webhooks/inngest

# 6. Start the app
npm run dev
```

### Optional: Devin AI

Set `DEVIN_API_KEY` and `DEVIN_DEFAULT_REPO` in `.env.local` to enable live Devin sessions. Without these, the mock adapter provides deterministic responses for development.

### Optional: GitHub Issue Sync

Set up a GitHub App for automatic issue creation:

```env
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
GITHUB_APP_INSTALLATION_ID=your-installation-id
```

Or use a Personal Access Token as fallback:

```env
GITHUB_TOKEN=ghp_...
```

---

## Key Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npx tsc --noEmit` | Type-check |
| `npm run db:push` | Sync schema to DB (dev) |
| `npm run db:migrate` | Create versioned migration |
| `npm run seed` | Seed demo data |
| `npm run ingest` | Embed knowledge base into pgvector |
| `npm run reset` | Full demo reset |
| `npx tsx scripts/run-eval.ts --name <name>` | Run eval suite |

---

## Optional Integrations

All integrations fall back to mock adapters when env vars are absent.

| Variable | Effect |
|---|---|
| `DEVIN_API_KEY` | Autonomous bug reproduction and code fixes via Cognition AI |
| `DEVIN_DEFAULT_REPO` | Default repository for Devin tasks |
| `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` + `GITHUB_APP_INSTALLATION_ID` | Auto-create GitHub issues from tickets (GitHub App) |
| `GITHUB_TOKEN` | GitHub issue creation fallback (PAT) |
| `HUGGING_FACE_API_KEY` | HF cross-encoder reranker for RAG |
| `SLACK_WEBHOOK_URL` | Slack notifications on approval |
| `SENTRY_AUTH_TOKEN` | Real Sentry error events for incident correlation |
| `DATADOG_API_KEY` | Real Datadog log enrichment |
| `ZENDESK_API_TOKEN` + `ZENDESK_SUBDOMAIN` | Zendesk ticket import |
| `JIRA_API_TOKEN` + `JIRA_BASE_URL` | Jira ticket creation on escalation |
| `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` | Required in production |

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

---

Built with Next.js 15, LangGraph.js, Inngest, Prisma + pgvector, Better Auth, and Devin AI.
