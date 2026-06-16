# Changelog

> **Purpose:** Records every feature addition and architectural change made to the platform after the initial build, organized by phase. This is the single source of truth for what was added in each phase (1–8): agent telemetry, guardrails, HITL approval, HuggingFace reranker, external integrations, incident clustering, eval system, and team management. Useful for understanding what exists in the codebase and why decisions were made.

All notable changes since the initial commit are documented here.

---

## [Unreleased] — 2026-05-23

### Phase 1 — Agent Control Center

**New agent telemetry on `AgentStep`**
- Added `tokenUsage` (prompt/completion/total tokens), `toolsCalled` (string[]), and `confidenceScore` (0.0–1.0) fields to `AgentStep` Prisma model
- All agent nodes updated to capture and persist token usage via `lib/agent-utils.ts::extractTokenUsage()`

**New lib**
- `lib/agent-utils.ts` — `extractTokenUsage()` and `estimateCostUsd()` helpers used by every agent node

**New UI components**
- `components/agents/token-usage-badge.tsx` — displays "1.2k tokens · ~$0.002" inline on agent steps
- `components/agents/pipeline-timing-bar.tsx` — Gantt-style bar showing relative duration of each pipeline step
- `components/agents/evidence-panel.tsx` — KB chunks with similarity + rerank scores
- `components/agents/step-detail-drawer.tsx` — slide-over drawer showing full step input/output/tools
- `components/agents/guardrails-badge.tsx` — warn/block flag indicators
- `app/(dashboard)/investigations/[runId]/page.tsx` — expanded to show full agent trace with clickable steps, timing bar, and evidence panel
- `app/api/investigations/[runId]/steps/` — GET endpoint for step detail used by the drawer

---

### Phase 2 — Guardrails Agent

**New agent node**
- `agents/nodes/guardrails-agent.ts` — runs after `response_drafting`, before `escalation`; checks draft reply for policy violations and optionally revises it
- `agents/prompts/guardrails.md` — LLM system prompt for guardrails policy enforcement

**New lib**
- `lib/guardrails-rules.ts` — deterministic PII/secret regex checks returning `GuardrailFlag[]` (runs before LLM guardrails pass)

**State changes (`agents/state.ts`)**
- `CorrelatedIncident` — renamed from `Incident` to avoid collision with the Phase 6 Prisma `Incident` model
- `GuardrailFlag` interface added (`type`, `severity`, `description`, `location`)
- `GuardrailsResult` interface added (`passed`, `flags`, `revisedDraft?`)
- `InvestigationState.guardrailsResult` field added

**Graph changes (`agents/graph.ts`)**
- Guardrails node inserted between `response_drafting` and `escalation`
- `guardrailsResult` annotation added to `InvestigationStateAnnotation`

**Schema changes**
- `InvestigationRun.guardrailsPassed` (Boolean, default true)
- `InvestigationRun.guardrailsResult` (Json?)

---

### Phase 3 — HITL Approval Flow

**Inngest function restructured (`inngest/functions.ts`)**
- Function timeout extended to `72h` (was `10m`) to accommodate human review window
- Step 1: execute investigation graph
- Step 2: set `status: "awaiting_approval"`, `approvalStatus: "pending"`
- Step 3: `step.waitForEvent("investigation/approval.submitted", { timeout: "72h" })`
- Step 4: process approval — writes `ApprovalAudit`, updates `InvestigationRun`, posts Slack notification
- Timeout path: auto-completes with `approvalStatus: "timeout"` if no reviewer acts within 72h

**New Prisma model**
- `ApprovalAudit` — full audit trail with `action`, `actorId`, `originalDraft`, `finalDraft`, `note`

**Schema changes on `InvestigationRun`**
- `status` gains `"awaiting_approval"` as a valid value
- `approvalStatus` — `"pending" | "approved" | "rejected" | "timeout"`
- `approvedAt`, `approvedBy` (Clerk userId), `editedReply`, `reviewerNote`
- `approvalRequests ApprovalAudit[]` relation

**New API routes**
- `app/api/investigations/[runId]/approve/` — POST; writes `ApprovalAudit`, updates run, fires `investigation/approval.submitted` Inngest event
- `app/api/investigations/pending/` — GET; lists runs with `approvalStatus: "pending"`

**New pages**
- `app/(dashboard)/approvals/page.tsx` — approval queue with SLA timers and customer tier badges
- `app/(dashboard)/approvals/[runId]/` — review page with draft editor, diff view, approve/reject buttons

**New components**
- `components/approvals/approval-queue-table.tsx` — sortable queue with SLA countdown
- `components/approvals/reply-editor.tsx` — textarea with original/edited diff + approve/reject actions

**Navigation**
- Approvals added to sidebar with a live pending-count badge (amber)
- `OrganizationSwitcher` added to sidebar header
- Sidebar layout converted to async Server Component to fetch pending count from DB

---

### Phase 4 — Reranker + Evidence Quality

**New lib**
- `lib/reranker.ts` — HuggingFace Inference API cross-encoder (`cross-encoder/ms-marco-MiniLM-L-6-v2`); 5-min in-memory cache; graceful fallback to pgvector order when `HUGGING_FACE_API_KEY` is absent or API fails

**Knowledge agent updated**
- `agents/nodes/knowledge-agent.ts` — fetches 15 candidates, reranks, returns top 5 to state
- `agents/tools/docs-tool.ts` — wires `rerankChunks()` from `lib/reranker.ts`

**State changes**
- `KnowledgeChunk` extended with `rerankScore?` (HF cross-encoder score) and `citedBy?` (agent names that referenced the chunk)

---

### Phase 5 — External Integrations

**New lib**
- `lib/integrations/types.ts` — `IIntegrationAdapter` interface
- `lib/integrations/slack/` — real Slack webhook client + mock; auto-selected by presence of `SLACK_WEBHOOK_URL`
- `lib/integrations/sentry/` — Sentry API client + mock; auto-selected by `SENTRY_AUTH_TOKEN`
- `lib/integrations/datadog/` — Datadog mock adapter (log enrichment); real client gated on `DATADOG_API_KEY`
- `lib/integrations/zendesk/` — Zendesk import/webhook mock; real client gated on `ZENDESK_API_TOKEN`

**New API routes**
- `app/api/integrations/slack/test/` — POST; tests Slack webhook connectivity
- `app/api/integrations/zendesk/simulate/` — GET; creates a demo ticket via Zendesk mock
- `app/api/integrations/zendesk/import/` — POST; Zendesk webhook receiver, creates tickets in DB

**Settings page revamped (`app/(dashboard)/settings/page.tsx`)**
- Full integration card grid showing live/mock status per integration
- Model info section (LLM, embedding, reranker)
- Demo reset button

**New components**
- `components/settings/integration-card.tsx` — live/mock indicator with test button (client component)
- `components/settings/demo-reset.tsx` — extracted client component for the reset action

**Env vars added (`lib/env.ts`)**
- `HUGGING_FACE_API_KEY`, `SLACK_WEBHOOK_URL`, `DATADOG_API_KEY`, `ZENDESK_API_TOKEN`, `ZENDESK_SUBDOMAIN`, `SENTRY_AUTH_TOKEN`, `GITHUB_TOKEN`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` (all optional)

---

### Phase 6 — Incident Clustering

**New Prisma models**
- `Incident` — clustered incident with `status`, `severity`, `internalTimeline Json`, `affectedCount`
- `IncidentTicket` — join table linking `Incident` to `Ticket`
- `IntegrationConfig` — metadata record for each integration (enabled, apiKey reference, webhookUrl)

**New lib**
- `lib/incident-clustering.ts` — heuristic clustering by same product/category/region within a 4-hour window; `suggestClusters()` and `autoCluster()` exports

**New Inngest function**
- `clusterTicketsFunction` in `inngest/functions.ts` — triggered by `"ticket/created"` event; runs clustering heuristic and auto-creates/updates `Incident` records

**New API routes**
- `app/api/incidents/` — GET list, POST create
- `app/api/incidents/[id]/` — GET detail, PATCH update status/severity
- `app/api/incidents/[id]/tickets` — POST; manually link a ticket to an incident
- `app/api/incidents/suggest/` — GET; returns candidate ticket clusters for manual review

**New pages**
- `app/(dashboard)/incidents/page.tsx` — incident list with severity banners
- `app/(dashboard)/incidents/[id]/` — incident detail: affected customers, status page editor, timeline

**New components**
- `components/incidents/incident-header.tsx` — P0/P1/P2 severity banner
- `components/incidents/affected-customers-table.tsx` — customers impacted by an incident
- `components/incidents/status-page-editor.tsx` — textarea + preview for status page copy (client component)
- `components/incidents/incident-timeline.tsx` — vertical timeline of status events from `internalTimeline`

**Ticket model updated**
- `incidents IncidentTicket[]` relation added
- `orgId` field added (with index)

---

### Phase 7 — Eval System

**New Prisma models**
- `EvalExample` — golden test case bootstrapped from approved investigations
- `EvalRun` — one eval run with aggregate pass rate and metadata
- `EvalResult` — per-example scores across 4 dimensions

**New lib**
- `lib/eval-runner.ts` — runs `agents/graph.ts` directly (bypasses Inngest) against each `EvalExample`; creates ephemeral tickets under first DB customer
- `lib/eval-judge.ts` — `gpt-4o-mini` judge scoring root cause accuracy (35%), evidence quality (25%), response tone (20%), no hallucinations (20%)

**New prompts**
- `agents/prompts/eval-judge.md` — LLM judge scoring rubric

**New scripts**
- `scripts/run-eval.ts` — CLI runner (`npx tsx scripts/run-eval.ts --name <name>`)
- `scripts/export-eval-data.ts` — bootstraps `EvalExample` rows from approved `InvestigationRun` records

**New API routes**
- `app/api/eval/runs/` — GET list, POST trigger new run
- `app/api/eval/runs/[id]/` — GET single run with results
- `app/api/eval/examples/` — GET list, POST create

**New pages**
- `app/(dashboard)/eval/page.tsx` — eval run history with pass rate trend
- `app/(dashboard)/eval/[runId]/` — per-run detail: per-example scores, dimension breakdowns
- `app/(dashboard)/eval/examples/` — golden example browser

**New components**
- `components/eval/score-card.tsx` — per-dimension score bars
- `components/eval/pass-rate-chart.tsx` — pure CSS/SVG bar chart for pass rate trend

---

### Phase 8 — Team / Org Members

**New page**
- `app/(dashboard)/team/page.tsx` — org member list fetched via Clerk `getOrganizationMembershipList`

**New component**
- `components/team/member-list.tsx` — table with avatar, name, email, role badge, joined date

---

### Cross-cutting Changes

**Auth (`lib/auth.ts`)**
- `requireOrgAuth()` added — returns `{ userId, orgId, orgRole }` or throws 401; used by org-scoped API routes

**Schema: `orgId` fields**
- `Customer.orgId`, `Ticket.orgId`, `InvestigationRun.orgId` — all default to `""` for backwards compatibility; indexes added on all three

**Navigation (`app/(dashboard)/layout.tsx`)**
- Added: Approvals (with pending badge), Incidents, Eval, Team
- `OrganizationSwitcher` (Clerk) added to sidebar
- Layout is now an async Server Component

**Ticket creation (`app/api/tickets/route.ts`)**
- POST now fires `"ticket/created"` Inngest event to trigger auto-clustering

**Inngest webhook (`app/api/webhooks/inngest/route.ts`)**
- `clusterTicketsFunction` registered alongside `runInvestigationFunction`

**CLAUDE.md**
- Fully expanded with architecture boundaries, agent pipeline diagram, known pitfalls, eval system docs, integration adapter pattern, deployment notes, and per-phase feature documentation
