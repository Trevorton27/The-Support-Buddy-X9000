# User UI Test Checklist

> **Purpose:** Manual UI test cases covering every major surface of the platform. Run these after any significant code change or before a demo to verify end-to-end functionality. Tests are organized by feature area and ordered to follow a realistic user session. No tooling required — work through each checklist item in the browser at `http://localhost:3000`. Automated unit tests (`npm test`) cover pure utility logic; this document covers the integrated UI behaviour that unit tests cannot.

---

## Prerequisites

Before running any tests, confirm the local stack is running:

```bash
docker compose up -d
npm run db:push
npm run seed
npm run ingest
npx inngest-cli@latest dev   # separate terminal
npm run dev
```

Sign in at `http://localhost:3000/sign-in`.

---

## 1. Authentication

### 1.1 Sign-in redirect
- [ ] Visit `http://localhost:3000` — confirm landing page loads (not redirected to `/dashboard`)
- [ ] Click sign-in / "Get Started" — confirm redirect to `/sign-in`
- [ ] Enter valid Clerk credentials — confirm redirect to `/dashboard` after login
- [ ] Confirm user avatar/button visible in sidebar

### 1.2 Protected route guard
- [ ] Sign out (click user avatar → Sign out)
- [ ] Navigate directly to `http://localhost:3000/dashboard` — confirm redirect to `/sign-in`
- [ ] Navigate directly to `http://localhost:3000/tickets` — confirm redirect to `/sign-in`

### 1.3 Organization switcher
- [ ] Sign back in — confirm `OrganizationSwitcher` is visible in the sidebar header
- [ ] If multiple orgs exist, switch org — confirm page reloads and context changes

---

## 2. Dashboard (`/dashboard`)

- [ ] KPI cards load: **Open Tickets**, **Investigations Today**, **Avg Resolution Time**, **Critical Unresolved** — all show numeric values
- [ ] Recent investigations list visible — shows ticket title, status badge, relative timestamp
- [ ] Clicking a recent investigation navigates to `/investigations/[runId]`

---

## 3. Tickets (`/tickets`)

### 3.1 Ticket list
- [ ] Page loads with 7 pre-seeded tickets in a table
- [ ] Each row shows: ticket title, customer name, severity badge, status badge, created date
- [ ] Severity badges are colour-coded (critical = red, high = orange, medium = grey, low = outline)
- [ ] Clicking a ticket row navigates to `/tickets/[ticketId]`

### 3.2 Filtering
- [ ] Filter by status (e.g. "open") — list updates to show only matching tickets
- [ ] Filter by severity (e.g. "critical") — list updates correctly
- [ ] Clear filters — all 7 tickets reappear

### 3.3 Ticket detail (`/tickets/[ticketId]`)
- [ ] Ticket title, description, created date, status, severity all visible
- [ ] Customer card shows: name, company, plan tier, region, account age
- [ ] Investigation panel visible — shows "No investigation yet" or latest run status
- [ ] **Run Investigation** button present and enabled
- [ ] If a previous investigation exists, a link to it is shown

---

## 4. Agent Investigation

### 4.1 Trigger
- [ ] On a ticket detail page, click **Run Investigation**
- [ ] Confirm immediate redirect to `/investigations/[runId]`
- [ ] `InvestigationRun` status shows **running** (or **pending** briefly)

### 4.2 Live agent timeline (`/investigations/[runId]`)
- [ ] Agent steps appear incrementally (page refreshes every 2s automatically)
- [ ] Steps appear in order: Intake → Customer Context → (parallel group) → Root Cause → Response Drafting → Guardrails → Escalation
- [ ] Each step card shows: agent name, status icon (spinning while running, checkmark when done), duration in ms/s
- [ ] Clicking a step card opens the **Step Detail Drawer**

### 4.3 Step Detail Drawer
- [ ] Drawer slides in from the right when a step is clicked
- [ ] Shows: agent name, status, duration, input JSON, output JSON, tools called
- [ ] **Token Usage Badge** visible: format "1.2k tokens · ~$0.002"
- [ ] Close button (or click outside) dismisses the drawer

### 4.4 Pipeline Timing Bar
- [ ] After all steps complete, a Gantt-style timing bar is visible
- [ ] Each agent segment proportional to its duration
- [ ] Hovering a segment shows the agent name and exact duration

### 4.5 Evidence Panel (Knowledge chunks)
- [ ] Knowledge Retrieval step shows an evidence panel below the step card
- [ ] Each chunk card shows: source title, similarity score bar, excerpt text
- [ ] If reranker is configured (`HUGGING_FACE_API_KEY`), a rerank score is also shown alongside the vector score

### 4.6 Guardrails Badge
- [ ] After the Guardrails step, a badge is visible on the timeline
- [ ] If no flags: green "Passed" badge
- [ ] If warnings/blocks: amber "Warn" or red "Block" badge with flag descriptions

### 4.7 Hypothesis cards
- [ ] After Root Cause step, ranked hypotheses appear below the timeline
- [ ] Each card shows: title, description, confidence score (%), evidence list, recommendation
- [ ] Cards sorted by confidence descending

### 4.8 Customer reply and escalation note
- [ ] Drafted customer reply visible as formatted text
- [ ] Internal escalation note visible below it
- [ ] If guardrails revised the draft, the revised version is shown

### 4.9 Investigation list (`/investigations`)
- [ ] All runs listed with: ticket title, status badge, started/completed timestamps
- [ ] Clicking a run navigates to `/investigations/[runId]`

---

## 5. HITL Approval (`/approvals`)

### 5.1 Approval queue
- [ ] After an investigation completes, a pending badge count appears in the sidebar next to **Approvals**
- [ ] `/approvals` page shows the run in the queue table
- [ ] Table columns: ticket title, customer, severity, SLA timer (counting down), status
- [ ] Clicking a row navigates to `/approvals/[runId]`

### 5.2 Review page (`/approvals/[runId]`)
- [ ] Original draft reply visible in a read-only panel
- [ ] Editable textarea pre-filled with the draft
- [ ] **Approve** and **Reject** buttons visible
- [ ] Can edit the reply text in the textarea

### 5.3 Approve flow
- [ ] Edit the reply text (add a word), click **Approve**
- [ ] Confirm success toast or redirect back to `/approvals`
- [ ] Return to `/approvals` — run no longer appears in queue (or shows "approved" badge)
- [ ] Navigate to `/investigations/[runId]` — `approvalStatus` shows **approved**, `editedReply` shows the modified text

### 5.4 Reject flow
- [ ] On a different run, click **Reject** (optionally add a reviewer note)
- [ ] Confirm run disappears from approval queue
- [ ] On investigation detail, `approvalStatus` shows **rejected**

---

## 6. Incidents (`/incidents`)

### 6.1 Incident list
- [ ] Page loads showing any auto-clustered or manually created incidents
- [ ] Each row shows: title, severity (P0/P1/P2 banner colour), status, affected ticket count, created date
- [ ] Clicking an incident navigates to `/incidents/[id]`

### 6.2 Incident detail (`/incidents/[id]`)
- [ ] Severity banner at top (red for P0/P1, amber for P2)
- [ ] Description and status visible
- [ ] **Affected Customers Table** lists impacted customers (name, plan, region)
- [ ] **Status Page Editor** — textarea allows editing the public status message; preview updates on change
- [ ] **Incident Timeline** — vertical list of status events from `internalTimeline`

### 6.3 Auto-clustering trigger
- [ ] (Requires Inngest running) Create two tickets via admin or API with same product + category + region
- [ ] Navigate to `/incidents` — confirm a new incident was auto-created linking both tickets

---

## 7. Knowledge Library (`/knowledge`)

### 7.1 Library page
- [ ] Page loads with a grid/list of indexed knowledge documents
- [ ] Each card shows: title, source type badge (colour-coded), tags, chunk count, relative timestamp
- [ ] Source type filter sidebar visible (RUNBOOK, INCIDENT\_REPORT, PRODUCT\_DOC, etc.)

### 7.2 Search
- [ ] Type a query (e.g. "connection pool") in the search box — results filter in real time (debounced)
- [ ] Clear search — all documents return
- [ ] Filter by source type "RUNBOOK" — only runbook documents shown
- [ ] Combine search + source type filter — results are intersection of both

### 7.3 Document detail (`/knowledge/[id]`)
- [ ] Title, source type, source name, tags, product area all shown in a metadata header
- [ ] LLM-generated summary (if present) shown in a card
- [ ] Collapsible chunk accordion: each chunk shows heading context, content excerpt, token count
- [ ] Expanding a chunk shows full content

---

## 8. Ticket Context Panel

- [ ] Navigate to any ticket detail page (`/tickets/[ticketId]`)
- [ ] **Knowledge Context** panel auto-loads on page render (calls `POST /api/tickets/[ticketId]/retrieve-context`)
- [ ] Results grouped by source type: Runbooks / Incidents & Tickets / Docs & Guides / Alerts & Logs
- [ ] Each result shows: `[KB-N]` citation label, document title, colour-coded score bar, excerpt
- [ ] Clicking "expand" on a result shows full chunk content
- [ ] Clicking a document title navigates to `/knowledge/[id]`
- [ ] Manual search input: type a query → results update to show ad-hoc retrieval results

---

## 9. Eval System (`/eval`)

### 9.1 Eval run list
- [ ] Page loads with list of past eval runs (or empty state if none exist)
- [ ] Pass rate trend chart visible (CSS/SVG bar chart) — each bar represents one run
- [ ] Each row shows: run name, pass rate %, total examples, started date

### 9.2 Eval run detail (`/eval/[runId]`)
- [ ] Per-example breakdown table: example ID, individual dimension scores, pass/fail
- [ ] **Score Card** components show dimension bars: Root Cause Accuracy, Evidence Quality, Response Tone, No Hallucinations
- [ ] Clicking an example shows its raw input and output JSON

### 9.3 Golden examples (`/eval/examples`)
- [ ] List of bootstrapped `EvalExample` records
- [ ] Each shows: input summary, expected output, source ticket, tags

---

## 10. Team (`/team`)

- [ ] Page loads with a table of organization members (fetched from Clerk)
- [ ] Columns: avatar, name, email, role badge (Admin / Member), joined date
- [ ] If only one member, single row shown
- [ ] Role badges are colour-coded

---

## 11. Settings (`/settings`)

### 11.1 Integration cards
- [ ] Four integration cards visible: Slack, Sentry, Datadog, Zendesk
- [ ] Each card shows **Live** (green) or **Mock** (grey) badge based on whether env var is set
- [ ] Slack card has a **Test** button — clicking it fires `POST /api/integrations/slack/test`
- [ ] Success/failure toast appears after test

### 11.2 Model info section
- [ ] LLM model shown: `gpt-4o`
- [ ] Embedding model shown: `text-embedding-3-small`
- [ ] Reranker status shown: Live (if `HUGGING_FACE_API_KEY` set) or Mock/Fallback

### 11.3 Demo reset
- [ ] **Reset Demo Data** button visible
- [ ] Clicking it shows a confirmation prompt
- [ ] After confirmation, DB is cleared and re-seeded; success toast appears
- [ ] Navigate to `/tickets` — 7 demo tickets present again

---

## 12. Admin (`/admin`)

- [ ] Page accessible (admin-only route)
- [ ] Can generate demo tickets with specified severity/category
- [ ] Can generate demo incidents
- [ ] After generating, new records appear in `/tickets` and `/incidents`

---

## 13. Cross-cutting

### 13.1 Sidebar navigation
- [ ] All nav items present: Dashboard, Tickets, Investigations, Approvals (with badge), Incidents, Knowledge, Eval, Team, Settings
- [ ] Active page is highlighted in the sidebar
- [ ] `OrganizationSwitcher` visible in sidebar header

### 13.2 Error states
- [ ] Navigate to a non-existent ticket (`/tickets/nonexistent-id`) — confirm 404 or error page, not a crash
- [ ] Navigate to a non-existent investigation (`/investigations/nonexistent-id`) — confirm graceful error

### 13.3 Mobile / responsive
- [ ] At viewport width 768px, sidebar collapses or scrolls correctly
- [ ] Ticket list table scrolls horizontally on small viewports
- [ ] Agent timeline remains readable at 375px width
