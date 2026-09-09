# A User's Manual: Getting To Know The Support Buddy X9000

Welcome to **The Support Buddy X9000** — an AI-powered support operations platform that investigates customer tickets, drafts responses, enforces safety guardrails, and routes everything through human approval before anything reaches a customer. This manual covers every screen in the application and how to use it.

---

## Table of Contents

1. [Signing In](#1-signing-in)
2. [The Sidebar](#2-the-sidebar)
3. [Dashboard](#3-dashboard)
4. [Tickets](#4-tickets)
5. [Investigations](#5-investigations)
6. [Approvals](#6-approvals)
7. [Incidents](#7-incidents)
8. [Mission Control](#8-mission-control)
9. [Knowledge Base](#9-knowledge-base)
10. [Ticket Generator](#10-ticket-generator)
11. [Training Mode](#11-training-mode)
12. [Eval System](#12-eval-system)
13. [Team](#13-team)
14. [Settings](#14-settings)
15. [Admin Panel](#15-admin-panel)
16. [Devin AI Integration](#16-devin-ai-integration)
17. [Bug Generator](#17-bug-generator)
18. [Demo Product Repository](#18-demo-product-repository)
19. [Glossary](#19-glossary)

---

## 1. Signing In

When you first visit the app, you'll be redirected to a sign-in page powered by Clerk. You can sign up with an email/password or a social provider.

After signing in, you're placed inside an **Organization**. Organizations are how The Support Buddy X9000 separates data between teams. Use the **Organization Switcher** in the sidebar to create or switch between organizations. All tickets, investigations, incidents, and work items are scoped to the currently selected organization.

**Roles:**

| Role | Permissions |
|------|-------------|
| **Admin** | Full access — run investigations, approve/reject, manage integrations, invite members, access admin panel, authorize Devin fix tasks |
| **Analyst** | Run investigations, approve/reject, view all data |
| **Viewer** | Read-only access to all data |

---

## 2. The Sidebar

The sidebar is your primary navigation. It's always visible on the left side of the screen.

| Icon | Label | Description |
|------|-------|-------------|
| Target | **Mission Control** | Your prioritized work queue |
| Layout | **Dashboard** | KPI overview and recent activity |
| Ticket | **Tickets** | All support tickets |
| Search | **Investigations** | AI investigation runs |
| Clipboard | **Approvals** | Human review queue (shows pending count badge) |
| Alert | **Incidents** | Clustered incident management |
| Book | **Knowledge** | Searchable knowledge base library |
| Wand | **Generate** | Synthetic ticket generator |
| Graduation | **Training** | Practice mode with scored investigations |
| Flask | **Eval** | Evaluation system for agent quality |
| Users | **Team** | Organization members |
| Bug | **Bug Generator** | Inject/revert test bugs in the demo product repo |
| Gear | **Settings** | Model info, integrations, demo reset |
| Shield | **Admin** | System administration (admins only) |

At the bottom of the sidebar you'll find your **user avatar** (click to manage your account) and a **theme toggle** for light/dark mode.

---

## 3. Dashboard

**Route:** `/dashboard`

The Dashboard is your landing page after sign-in. It provides a quick overview of platform health.

**KPI Cards:**
- **Open Tickets** — Number of unresolved tickets
- **Critical Tickets** — Tickets with "critical" severity (highlighted in red if > 0)
- **Investigations Today** — How many investigations were started today
- **Avg Resolution Time** — Mean time from investigation start to completion

**Recent Investigations:**
Below the KPI cards, you'll see the 5 most recently completed investigations. Each shows the ticket title, customer company, step count, duration, and when it ran. Click any row to jump to the full investigation trace.

---

## 4. Tickets

### Ticket List

**Route:** `/tickets`

This page shows all support tickets in the system. Each ticket card displays:

- **Title** — The ticket subject line
- **Customer** — Company name
- **Severity** — Color-coded badge (critical = red, high = orange, medium = blue, low = gray)
- **Status** — open, in_progress, resolved, or archived
- **Latest Investigation** — Status of the most recent investigation run, if any

**Filtering:** Use the filter controls at the top to narrow by status or severity.

**Click any ticket** to open its detail page.

### Ticket Detail

**Route:** `/tickets/[ticketId]`

The ticket detail page is divided into sections:

**Ticket Information:**
- Full title and description
- Customer name, company, plan tier, and region
- Severity and category
- Linked incident (if the ticket has been clustered into one — shows as a banner)

**Investigation Panel:**
- If no investigation has been run, you'll see a **"Run Investigation"** button. Clicking it fires off the full AI agent pipeline in the background and redirects you to the investigation trace page.
- If an investigation exists, you'll see its status and a link to view the full trace.

**Knowledge Context Panel:**
- Automatically retrieves the most relevant knowledge base articles for this ticket
- Groups results into categories: Runbooks, Incidents & Tickets, Docs & Guides, Alerts & Logs
- Each result shows a `[KB-N]` citation label, a color-coded similarity score bar, and an excerpt
- Use the **search box** to manually query the knowledge base for additional context

---

## 5. Investigations

### Investigation List

**Route:** `/investigations`

Shows the 50 most recent investigation runs, newest first. Each row displays:

- Ticket title and customer company
- **Status badge:** pending (gray), running (blue), awaiting_approval (amber), complete (green), failed (red), paused (orange), cancelled (gray)
- Number of agent steps completed
- Total duration
- When it started

Click any investigation to view the full trace.

### Investigation Trace (Detail Page)

**Route:** `/investigations/[runId]`

This is the most detailed page in the platform. It shows exactly what the AI agents did during an investigation.

**Header:**
- Ticket title, customer info, plan tier
- Investigation status badge
- **Investigation Controls** — contextual action buttons next to the status badge (see below)
- If awaiting approval, a "Pending approval →" link to the review page

**Investigation Controls:**

Depending on the current status, you'll see action buttons to control the investigation:

| Button | Available When | What It Does |
|--------|----------------|--------------|
| **Pause** | running, pending, awaiting_approval | Pauses the investigation. The Inngest background job will stop after its current step completes. Pipeline steps show "Paused" instead of "Queued". |
| **Cancel** | running, pending, awaiting_approval, paused | Cancels the investigation permanently. Records who cancelled it and when. |
| **Restart** | failed, cancelled, paused, complete | Resets the investigation — deletes all agent steps and re-fires the pipeline from scratch. Useful after fixing an API key issue, OpenAI credit exhaustion, or other transient failures. |

All actions take effect immediately in the database. If the Inngest background job is mid-execution, it checks for pause/cancel status between the graph execution step and the approval step.

**Pipeline Timing Bar:**
Appears for completed investigations. A Gantt-style horizontal bar chart showing how long each agent step took and which ran in parallel. Hover over segments to see exact durations.

**Agent Timeline (left column):**
A vertical timeline of every agent step in the pipeline:

1. **Intake** — Classifies the ticket (category, severity, product, summary)
2. **Customer Context** — Loads customer record and account history
3. **Log Analysis** — Searches for relevant error logs and traces
4. **Knowledge Retrieval** — RAG search against the knowledge base with reranking
5. **Incident Correlation** — Matches related past incidents
6. **Deployment Correlation** — Finds recent deployments that may be relevant
7. **Root Cause** — Generates ranked hypotheses with confidence scores
8. **Response Drafting** — Writes a customer-facing reply
9. **Guardrails** — Checks the draft for PII, secrets, policy violations
10. **Escalation** — Writes an internal engineering escalation note

Each step shows its status, and you can **click any step** to open a slide-over drawer with the full input, output, tools called, token usage, and confidence score.

**Guardrails Card:**
Shows whether the guardrails check passed or failed, with specific flags:
- PII detected (email, phone, SSN)
- Secrets detected (API keys, tokens)
- Low confidence claims
- Internal information leaks

**Customer Reply Card:**
Shows the AI-drafted reply (or the human-edited version if it was modified during approval). A "Human edited" badge appears if the reply was changed by a reviewer.

**Escalation Note Card:**
The internal engineering note generated by the escalation agent. This is never shown to customers.

**Devin AI Card:**
If the investigation is complete or awaiting approval, you'll see buttons to trigger Devin AI tasks. See [Section 16: Devin AI Integration](#16-devin-ai-integration) for details.

**Root Cause Hypotheses (right column):**
A ranked list of hypotheses generated by the root-cause agent. Each card shows:
- Hypothesis title and description
- Confidence percentage (0–100%)
- Supporting evidence
- Recommended action

---

## 6. Approvals

### Approval Queue

**Route:** `/approvals`

Every investigation that completes successfully enters the approval queue. No AI-generated response is ever sent to a customer without human review.

The queue shows investigations ordered by SLA urgency (oldest first). Each entry displays:
- Ticket title
- Customer name and tier (enterprise customers are highlighted)
- SLA timer showing how long the investigation has been waiting for review
- Investigation status

The **Approvals** nav item in the sidebar shows a **red badge** with the count of pending reviews.

### Review & Approve

**Route:** `/approvals/[runId]`

This is where you review and approve (or reject) an AI-drafted response.

**Left column:**

*Guardrails Review:*
- Shows any flags that were raised during the guardrails check
- If there are "block" severity flags, consider carefully before approving

*Draft Reply Editor:*
- A textarea pre-filled with the AI's drafted customer reply
- **Edit freely** — your changes are tracked. A blue indicator appears when you've modified the original draft: "Draft edited — diff will be recorded"
- **Reviewer Note** — An optional text field to leave internal notes about your decision

*Action Buttons:*
- **Approve & Send** — Marks the investigation as approved. The edited reply is saved. A Slack notification is sent (if configured).
- **Reject** — Marks the investigation as rejected. No reply is sent.

**Right column:**
- Top 3 root cause hypotheses for quick reference
- The original ticket description

**What happens after approval:**
- An `ApprovalAudit` record is created with the original draft, final draft, reviewer ID, and note
- The investigation status changes to "complete" with `approvalStatus: "approved"`
- A Slack notification is posted (if configured)
- The "Fix" button becomes available on the investigation page for Devin AI

---

## 7. Incidents

### Incident List

**Route:** `/incidents`

Incidents are automatically created when 3+ related tickets are detected within a 4-hour window (same product, category, and region). You can also create them manually from the admin panel.

The page is split into two sections:

**Active Incidents:**
- Each card shows title, status, severity dot (P0 = red, P1 = orange, P2 = yellow), affected product, region, ticket count, and start time

**Resolved Incidents:**
- The 5 most recently resolved incidents

Click any incident to open its detail page.

### Incident Detail

**Route:** `/incidents/[id]`

**Incident Header:**
A color-coded banner at the top showing severity (P0/P1/P2), status (investigating / identified / monitoring / resolved), title, and start time.

**Affected Customers Table:**
Lists every ticket linked to this incident, including customer name, company, plan, ticket severity, and whether an investigation has been run.

**Status Page Editor:**
A textarea for writing customer-facing status updates. Changes save immediately. Use this to draft status page messages during active incidents.

**Root Cause Hypothesis:**
If available, shows the current working theory for the incident's root cause.

**Internal Timeline (right column):**
A vertical timeline of all status change events, showing timestamp, event description, and who made the change.

---

## 8. Mission Control

**Route:** `/mission-control`

Mission Control is your personal work queue — a unified view of everything assigned to you.

### Shift Briefing

At the top of the page, an AI-generated summary of your current workload. Click "Generate Briefing" to refresh it. Shows total items and urgent count.

### Responsibility Map

A grid of status cards showing how many of your work items are in each state:

| Status | Meaning |
|--------|---------|
| **Needs Action** | Open items waiting for you to start |
| **In Progress** | Items you're actively working on |
| **Waiting (Customer)** | Blocked on customer response |
| **Waiting (Internal)** | Blocked on internal team |
| **Snoozed** | Temporarily deferred |
| **Needs Classification** | AI-created items needing human triage |
| **Recently Completed** | Items finished in the last 24 hours |
| **Pending Approvals** | Investigations awaiting your review |

### Needs Classification Queue

Work items that were auto-created by the system and need human classification. For each item you can:
- **Confirm** — Move to IN_PROGRESS
- **Dismiss** — Mark as COMPLETED

### Priority Queue

Your main work list, sorted by priority score (0–100). Each work item card shows:

- **Type icon** — Customer Reply, Investigation, Escalation, Approval, Incident Update, etc.
- **Title** and summary
- **Priority band** — URGENT (red border), HIGH (orange), MEDIUM (blue), LOW (gray)
- **Priority score** — Numeric score out of 100
- **Customer info** — Name, company, enterprise badge
- **Due date** — Highlighted red if overdue
- **Links** — Quick links to related ticket, investigation, or incident
- **Devin task** — If a Devin AI task is linked, shows its status, verdict, and PR link

**Expand any card** (click the chevron) to see:
- Suggested action
- Priority score explanation
- Devin task details (if applicable)
- Action buttons:
  - **Start** — Move from OPEN to IN_PROGRESS
  - **Complete** — Mark as done
  - **Snooze** — Defer for N hours
  - **Wait** — Set waiting on customer or internal
  - **Resume** — Reactivate snoozed or waiting items
  - **Adjust Priority** — Override the AI-calculated priority with a reason

### Work Assistant

A floating chat window in the bottom-right corner. Click the chat icon to open it. Ask questions about your workload and the AI assistant will respond with context from your work items and recent activity.

---

## 9. Knowledge Base

### Knowledge Library

**Route:** `/knowledge`

A searchable, filterable library of all documents indexed into the RAG system. Documents come from runbooks, incident reports, product docs, architecture docs, and more.

**Each document card shows:**
- Title and source type badge (color-coded)
- Source name and product area
- Tags
- LLM-generated summary (if available)
- Chunk count and last updated time

**Filtering:**
- Search by keyword
- Filter by source type (RUNBOOK, INCIDENT_REPORT, PRODUCT_DOC, etc.)
- Filter by product area

### Document Detail

**Route:** `/knowledge/[id]`

Shows the full document with all its metadata:
- Title, source type, source name
- Product area, customer segment, severity
- Tags
- LLM-generated summary
- All chunks in order, each showing heading context, token count, and full content

---

## 10. Ticket Generator

**Route:** `/generate`

The ticket generator creates synthetic support tickets for testing and training. This is useful for:
- Populating the system with realistic test data
- Training analysts on different ticket scenarios
- Evaluating agent pipeline performance

### Generator Wizard

Click **"Generate Tickets"** to launch the wizard. Configure:
- **Count** — How many tickets to generate
- **Difficulty** — Easy, medium, or hard (controls red herrings and ambiguity)
- **Customer** — Which customer to assign tickets to
- **Mode** — Synthetic (fresh) or incident-based (clustered)

Generation runs in the background via Inngest. Each generated ticket includes hidden ground truth metadata (true root cause, true category, injected faults) used by the training and eval systems.

### Batch History

A table showing all generation batches with status, ticket counts, and links to batch detail pages.

### Batch Detail

**Route:** `/generate/batches/[batchId]`

Shows all tickets in a batch with their hidden ground truth visible (operator view). You can export tickets as JSON or CSV.

### Generation Analytics

**Route:** `/generate/analytics`

Charts showing the distribution of generated tickets by difficulty, severity, and category.

### Knowledge Generator

**Route:** `/generate/knowledge`

Generate synthetic knowledge base documents (runbooks, incident reports, etc.) to populate the RAG system.

---

## 11. Training Mode

**Route:** `/training`

Training mode lets analysts practice investigating tickets where the ground truth is known but hidden.

### Leaderboard

Shows performance statistics grouped by difficulty level:
- Session count per difficulty
- Average scores for root cause accuracy, severity detection, deception resistance
- Pass rate

### Training Sessions

A table of all training sessions. Click any session to see the detail page.

### Session Detail

**Route:** `/training/[runId]`

Shows the investigation results alongside a "reveal" panel:
- Click **"Reveal Ground Truth"** to see the hidden true root cause, true severity, true category, injected faults (red herrings), and scenario details
- The **Training Score Panel** shows how the AI's output compared to ground truth across multiple dimensions

---

## 12. Eval System

**Route:** `/eval`

The eval system measures agent pipeline quality over time using golden test cases.

### Eval Dashboard

- **Pass Rate Trend** — A bar chart showing pass rates across recent eval runs
- **Run History** — List of eval runs with name, model, example count, pass rate, average score, and status

Click any run to see detailed results.

### Eval Run Detail

**Route:** `/eval/[runId]`

Shows per-example results with scores across 4 dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Root Cause Accuracy | 35% | Did the AI identify the correct root cause? |
| Evidence Quality | 25% | Was the evidence relevant and well-sourced? |
| Response Tone | 20% | Was the customer reply professional and helpful? |
| No Hallucinations | 20% | Did the AI avoid making unsupported claims? |

Failures are listed first (red headers), then passes (green headers). Each result card shows the ticket title, description snippet, and score bars for all dimensions.

### Golden Examples

**Route:** `/eval/examples`

Browse the test suite of golden examples. Each example shows the ticket title, expected root cause, evidence keywords, and how many eval results reference it.

**To add examples:** Run `npx tsx scripts/export-eval-data.ts` to bootstrap examples from approved investigations.

**To run an eval:** Run `npx tsx scripts/run-eval.ts --name <name>` from the command line.

---

## 13. Team

**Route:** `/team`

Shows all members of your current Clerk organization with their name, email, role badge, and join date.

**Role Permissions:**

| Permission | Admin | Analyst | Viewer |
|-----------|-------|---------|--------|
| View all data | Yes | Yes | Yes |
| Run investigations | Yes | Yes | No |
| Approve/reject | Yes | Yes | No |
| Manage integrations | Yes | No | No |
| Invite members | Yes | No | No |
| Admin panel access | Yes | No | No |
| Authorize Devin fixes | Yes | No | No |

If no organization is selected, you'll see a prompt to create or join one.

---

## 14. Settings

**Route:** `/settings`

### AI Models

Shows which models are used for each purpose:
- **Reasoning:** gpt-4o (main investigation agents)
- **Classification:** gpt-4o-mini (intake, guardrails)
- **Embeddings:** text-embedding-3-small (RAG)
- **Guardrails:** gpt-4o-mini
- **Eval Judge:** gpt-4o-mini

### Integrations

Each integration shows a card with:
- Name and description
- **Live** (green) or **Mock** (gray) status
- **Test** button (where available) to verify the connection
- The environment variable needed to enable it

| Integration | Purpose | Env Variable |
|------------|---------|-------------|
| Sentry | Error event correlation | `SENTRY_AUTH_TOKEN` |
| Datadog | Log enrichment | `DATADOG_API_KEY` |
| Slack | Approval notifications | `SLACK_WEBHOOK_URL` |
| Zendesk | Ticket import | `ZENDESK_API_TOKEN` |
| GitHub | Escalation issues | `GITHUB_TOKEN` |
| Jira | Escalation tickets | `JIRA_API_TOKEN` |
| Hugging Face | RAG reranking | `HUGGING_FACE_API_KEY` |
| Devin | Bug reproduction & fixes | `DEVIN_API_KEY` |

When an integration is in **mock mode**, the platform uses realistic fake data instead of making real API calls. No code changes needed — just set the environment variable to switch to live.

### Demo Reset

A danger-zone button that clears all investigation data and re-seeds the demo tickets. Use this to start fresh. Requires confirmation.

---

## 15. Admin Panel

**Route:** `/admin` (admin role required)

The admin panel provides system-level controls:

**System Health Cards:**
- Open tickets, critical tickets, active investigations, pending approvals
- Knowledge base chunk count
- Total tokens consumed with estimated cost

**Knowledge Base Management:**
- Ingest new documents
- Re-embed the knowledge base
- View chunk statistics

**HuggingFace Reranker:**
- Live/mock status
- Test reranking
- Clear the 5-minute result cache

**Ticket Generator:**
- Create individual test tickets with specific customer, product, and severity

**Incident Creator:**
- Manually create incidents
- Link specific tickets
- Set severity and initial status

---

## 16. Devin AI Integration

Devin is Cognition AI's autonomous coding agent. The Support Buddy X9000 integrates with Devin to reproduce bugs and implement narrowly scoped fixes after human authorization.

### Reproduce with Devin

Available on any investigation that is **complete** or **awaiting approval**.

1. Go to the investigation detail page (`/investigations/[runId]`)
2. Scroll to the **Devin AI** card
3. Click **"Reproduce with Devin"**
4. Review the confirmation dialog — note that reproduction mode is **read-only** (no code changes, no PRs)
5. Click **Confirm**

What happens:
- A `DevinTask` is created with mode "reproduce"
- A work item appears in Mission Control
- An Inngest background job creates a Devin session and polls it every 2 minutes
- The full investigation context (ticket, hypotheses, logs, knowledge chunks, incidents, deployments) is sent to Devin as a structured prompt
- Evidence sections are wrapped in untrusted delimiters to prevent prompt injection

### Send Fix to Devin

Available only after an investigation is **approved** and requires **admin role**.

1. Go to the investigation detail page
2. Click **"Send to Devin (Fix)"**
3. Review the warning dialog carefully:
   - Code changes: **Authorized**
   - PR creation: **Authorized**
   - Auto-merge: **NOT authorized** (a human must review and merge)
4. Click **Authorize Fix**

Devin receives the same investigation context plus the approved reply, reviewer notes, and escalation note.

### Monitoring Devin Tasks

**On the investigation page:**
The Devin Tasks section shows all tasks for this investigation with:
- Mode badge (Reproduce / Fix)
- Status with animated pulse for active sessions
- Link to the Devin session
- Verdict badge when complete
- Pull Request link (fix mode only)

**In Mission Control:**
Work items linked to Devin tasks show the task status inline. Expand the card to see full details.

### Task Actions

- **Send Message** — Send a message to an active Devin session (click the send icon)
- **Cancel** — Stop a running task (click the X icon). Sends a stop message to Devin and marks the work item as cancelled.

### Verdicts

**Reproduction verdicts:**

| Verdict | Meaning |
|---------|---------|
| REPRODUCED | Bug confirmed in the target environment |
| UNABLE_TO_REPRODUCE | Could not reproduce the reported issue |
| CONFIGURATION_ISSUE | Problem is environmental, not a code bug |
| PRODUCT_DEFECT | Confirmed product bug |
| DOCUMENTATION_DEFECT | Documentation is wrong or misleading |
| ADDITIONAL_INFORMATION_REQUIRED | Need more info to proceed |

**Fix verdicts:**

| Verdict | Meaning |
|---------|---------|
| FIX_SUBMITTED | PR opened with the fix |
| FIX_FAILED | Unable to implement a fix |

### Mock Mode

When `DEVIN_API_KEY` is not set, the platform uses a mock adapter that simulates Devin sessions. Mock sessions cycle through: working → working → finished with a deterministic result. This lets you test the full workflow without a Devin account.

---

## 17. Bug Generator

**Route:** `/bug-generator`

The Bug Generator lets you inject and revert reproducible bugs in the companion **Demo Product Repository** — a separate codebase that represents the fictional SaaS product your customers are filing tickets about.

This is the key tool for testing the full Devin AI loop: inject a bug, create a ticket, investigate it, and let Devin reproduce and fix it.

### Repository Status

At the top of the page, a status card shows whether the Demo Product Repository is connected. The platform looks for it at `../support-buddy-demo-product` relative to the project root, or at the path specified by the `DEMO_PRODUCT_REPO_PATH` environment variable.

### Bug Templates

Templates are grouped by service. Each template card shows:

- **Title** — What the bug does
- **Service** — Which service in the demo repo is affected (e.g., `auth-service`, `webhook-dispatcher`)
- **Severity** — critical, high, medium, or low
- **Difficulty** — easy, medium, or hard (how many lines the fix requires)
- **Category** — authentication, data, integration, performance, or configuration
- **Active indicator** — Red "Active" badge if the bug is currently injected

### Available Bug Templates

| Template | Service | Severity | What Goes Wrong |
|----------|---------|----------|-----------------|
| Certificate region mismatch | auth-service | critical | EU users get the US signing certificate, failing SAML validation |
| Stale org context | auth-service | high | Switching organizations returns the old org's session data |
| Legacy header ignored | webhook-dispatcher | high | `X-Webhook-Sig` header not checked after rename to `X-Signature-256` |
| Hardcoded timeout | order-service | critical | Query timeout stuck at 3s despite config change to 10s |
| Key propagation race | billing-service | critical | Newly rotated API keys rejected during async activation window |
| Burst double-counting | rate-limiter | medium | Burst requests charged at multiplier rate, draining limits 5x faster |
| Pool scaling ignored | database-client | high | Pool size not divided by instance count — 20 instances exhaust DB |

### Actions

Each template has action buttons:

| Button | What It Does |
|--------|--------------|
| **Inject Bug** | Replaces the correct code with the buggy version in the demo repo. Writes a regression test that will fail. |
| **Inject + Create Ticket** | Same as above, plus creates a matching support ticket in The Support Buddy X9000 with realistic title, description, severity, and product fields. |
| **Revert Fix** | Replaces the buggy code with the correct version. Use this to reset after Devin (or a developer) has fixed the bug. |

### End-to-End Testing Loop

The recommended workflow for testing the full platform:

```
1. Open Bug Generator → click "Inject + Create Ticket" on a template
2. Go to Tickets → find the new ticket
3. Click "Run Investigation" → watch the AI pipeline analyze it
4. Go to Approvals → review and approve the AI's draft reply
5. On the investigation page → click "Reproduce with Devin"
6. Wait for Devin to confirm the bug
7. Click "Send to Devin (Fix)" → Devin submits a PR
8. Review and merge the PR on GitHub
9. Return to Bug Generator → click "Revert Fix" to reset for next test
```

---

## 18. Demo Product Repository

The **Demo Product Repository** ([GitHub](https://github.com/Trevorton27/support-buddy-demo-product)) is a separate TypeScript monorepo that represents the fictional SaaS product supported by The Support Buddy X9000.

### Purpose

Support tickets in The Support Buddy X9000 describe real bugs — SAML authentication failures, webhook delivery errors, database connection exhaustion, etc. The demo product repo contains the **actual source code** where those bugs live, giving Devin AI a real codebase to clone, investigate, and fix.

### Structure

```
support-buddy-demo-product/
├── services/
│   ├── auth-service/          — SAML SSO, JWT, session management
│   ├── order-service/         — Order processing, /v2/orders API
│   ├── webhook-dispatcher/    — Webhook delivery + HMAC signatures
│   ├── billing-service/       — API key management
│   ├── rate-limiter/          — Token bucket rate limiting
│   └── database-client/       — Connection pool wrapper
├── packages/
│   └── shared-config/         — Shared TypeScript types
├── AGENTS.md                  — Instructions for Devin AI
└── package.json
```

### How defects work

Each service contains:
- **Real TypeScript code** with a subtle, realistic bug
- **Failing tests** that prove the bug exists and describe expected behavior
- **A narrow fix** (1–5 lines) that resolves the issue

The seeded defects map directly to The Support Buddy X9000's demo data:

| Support Ticket | Deployment | Service | Bug |
|----------------|------------|---------|-----|
| TKT-002: SAML SSO failing for EU users | auth-service v1.9.5 | `auth-service` | Wrong cert for region |
| TKT-004: Webhook 30% failure rate | webhook-dispatcher v3.1.2 | `webhook-dispatcher` | Legacy header ignored |
| TKT-001: API 500 errors on /v2/orders | order-service v2.4.1 | `order-service` | Hardcoded timeout |
| TKT-005: Billing key rotation 401s | billing-service v4.0.3 | `billing-service` | Pending key rejection |
| TKT-006: Rate limit at 200 not 1000 | rate-limiter v2.2.0 | `rate-limiter` | Burst double-count |
| TKT-003: DB connection pool exhaustion | database-proxy pgbouncer-1.21.0 | `database-client` | No instance scaling |

### Running tests

```bash
cd support-buddy-demo-product
npm install
npm test          # 32 tests: 21 pass, 11 fail (the seeded bugs)
```

### Connecting it

Add to The Support Buddy X9000's `.env.local`:

```bash
# Local path for Bug Generator file operations
DEMO_PRODUCT_REPO_PATH=/path/to/support-buddy-demo-product

# GitHub URL for Devin AI to clone
DEVIN_DEFAULT_REPO=https://github.com/Trevorton27/support-buddy-demo-product
```

---

## 19. Glossary

| Term | Definition |
|------|-----------|
| **Agent Step** | One node in the investigation pipeline (e.g., intake, log analysis, root cause) |
| **Bug Generator** | Tool for injecting and reverting reproducible defects in the demo product repo |
| **Bug Template** | A predefined defect with buggy code, fixed code, failing test, and matching ticket definition |
| **Approval** | Human review of an AI-drafted customer reply before it can be sent |
| **Confidence Score** | 0–100% rating of how certain an agent is about its output |
| **Demo Product Repository** | A companion codebase containing the fictional SaaS product with seeded bugs for Devin testing |
| **Devin Task** | An asynchronous job sent to Cognition AI's Devin for bug reproduction or fixing |
| **Eval Example** | A golden test case with known-good expected outputs |
| **Eval Run** | A batch execution of all eval examples to measure agent quality |
| **Guardrails** | Safety checks that scan AI output for PII, secrets, and policy violations |
| **Hypothesis** | A candidate root cause generated by the root-cause agent |
| **Incident** | A group of related tickets indicating a broader system problem |
| **Inngest** | The background job system that runs investigations and polls Devin |
| **Investigation** | A full run of the AI agent pipeline against a support ticket |
| **Knowledge Chunk** | A section of a knowledge base document, embedded as a vector for RAG search |
| **Mission Control** | Your personal prioritized work queue |
| **Organization** | A Clerk org that scopes all data — tickets, investigations, incidents, etc. |
| **Priority Band** | URGENT / HIGH / MEDIUM / LOW — derived from the priority score |
| **Priority Score** | 0–100 numeric score calculated from severity, customer tier, SLA, and other factors |
| **RAG** | Retrieval-Augmented Generation — the AI searches the knowledge base before answering |
| **Reranker** | A HuggingFace cross-encoder model that re-scores RAG results for relevance |
| **Work Item** | A unit of work in Mission Control (approval, follow-up, escalation, Devin task, etc.) |
| **Work Signal** | An incoming event that gets processed into a work item |
