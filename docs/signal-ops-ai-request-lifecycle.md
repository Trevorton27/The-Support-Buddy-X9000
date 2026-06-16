# Signal Ops Flow

> **Purpose:** Maps the general AI application request lifecycle (User → System Prompt → Tool Calling → Agent Response) onto the concrete structure of this codebase. Useful as a mental model for understanding how a browser request flows through Next.js, Clerk auth, Inngest, and the LangGraph agent pipeline, and where each layer of the stack sits relative to the others.

This document maps the general AI application flow below to the actual structure of `Trevorton27/-signal-ops-ai-v2`.

```txt
User
↓
System Prompt
↓
Tool Calling
↓
RAG Retrieval
    ↓
 Embeddings
↓
Retrieved Context
↓
Context Window
↓
LLM
↓
Structured Output
↓
Application
```

## 0. High-level repo purpose

`signal-ops-ai-v2` is a multi-agent AI support operations platform. A user submits or opens a support ticket, starts an investigation, and the app runs a LangGraph/Inngest pipeline that classifies the ticket, gathers customer/log/incident/knowledge context, generates root-cause hypotheses, drafts a customer reply, applies guardrails, and routes the result to a human approval queue.

Core stack:

- Next.js App Router UI/API layer
- Clerk authentication
- Inngest background jobs
- LangGraph agent orchestration
- OpenAI models for classification, reasoning, guardrails, and evaluation
- PostgreSQL + Prisma + pgvector for application data and semantic knowledge retrieval
- Hugging Face cross-encoder reranking as an optional retrieval improvement

---

# 1. User

## What happens

The user interacts with the web application through dashboard pages such as tickets, investigations, approvals, incidents, evals, and the knowledge library.

A typical flow starts when the user opens a ticket detail page and clicks **Run Investigation**.

```txt
User opens ticket
↓
User clicks Run Investigation
↓
Browser sends ticketId to backend
```

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Ticket list/detail UI | `app/(dashboard)/tickets/page.tsx`, `app/(dashboard)/tickets/[ticketId]/page.tsx` | Shows tickets and ticket detail. The ticket detail page is the user-facing entry point for running an investigation. |
| Ticket UI components | `components/tickets/` | Ticket-specific client/server UI components. |
| Knowledge context on ticket page | `components/knowledge/ticket-context-panel.tsx` | Auto-retrieves relevant knowledge articles/runbooks for the ticket and lets the user manually search. |
| Protected app shell | `app/(dashboard)/layout.tsx` | Dashboard sidebar, org switcher, protected layout. |
| Auth gate | `middleware.ts`, `lib/auth.ts` | Ensures only authenticated users/org members access protected pages and APIs. |

## Data passed to next step

The key user-facing input is usually a `ticketId`. The app uses that ID to fetch:

- ticket title
- ticket description
- severity/category/product fields
- customer relationship
- organization scope

That data becomes the starting input for the backend investigation pipeline.

---

# 2. System Prompt

## What happens

System prompts define each agent's role, decision rules, output style, and safety constraints. In this app, the prompts are stored as Markdown files and loaded by agent nodes.

Instead of one generic prompt, the app uses specialized prompts for each stage.

```txt
Ticket data
+
Agent-specific system prompt
↓
LLM request
```

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Agent prompts | `agents/prompts/` | Prompt library for individual agents. |
| Intake prompt | `agents/prompts/intake.md` | Guides classification of ticket category/severity. |
| Log analysis prompt | `agents/prompts/log-analysis.md` | Guides analysis of logs and patterns. |
| Knowledge retrieval prompt | `agents/prompts/knowledge-retrieval.md` | Guides how retrieved knowledge should be used and cited. |
| Root cause prompt | `agents/prompts/root-cause.md` | Guides hypothesis ranking and confidence scoring. |
| Response drafting prompt | `agents/prompts/response-drafting.md` | Guides customer-facing response generation. |
| Guardrails prompt | `agents/prompts/guardrails.md` | Guides policy, PII, secret, and internal-leak checks. |
| Escalation prompt | `agents/prompts/escalation.md` | Guides internal escalation note creation. |
| Eval judge prompt | `agents/prompts/eval-judge.md` | Guides LLM-based scoring during eval runs. |

## Data passed to next step

The system prompt does not usually produce user-visible output by itself. It shapes the next model/tool action by defining:

- what the agent is responsible for
- what data it should inspect
- whether it should call a tool
- what JSON/object structure it should return
- what evidence/citations it must include

---

# 3. Tool Calling

## What happens

Tool calling is how the agent pipeline accesses application data and external systems. The LLM is not expected to know the customer, logs, tickets, docs, deployments, or incidents from memory. Instead, agent nodes call server-side tools that fetch this information.

In this repo, the tool layer is represented mostly by `agents/tools/` plus integration adapters under `lib/integrations/`.

```txt
Agent node
↓
Tool function
↓
Database / mock data / external adapter
↓
Tool result returned into agent state
```

## Main files/folders

| Tool area | Files/folders | Role |
|---|---|---|
| Ticket tool | `agents/tools/ticket-tool.ts` | Fetches ticket-related data. |
| Customer tool | `agents/tools/customer-tool.ts` | Fetches customer record/context. |
| Logs tool | `agents/tools/logs-tool.ts` | Fetches/analyzes logs; can use Datadog adapter. |
| Docs/RAG tool | `agents/tools/docs-tool.ts` | Searches knowledge chunks via pgvector and reranking. |
| Incident tool | `agents/tools/incident-tool.ts` | Finds related incidents and historical patterns. |
| Escalation tool | `agents/tools/escalation-tool.ts` | Creates internal escalation notes and can integrate with GitHub/Jira. |
| Integration adapter types | `lib/integrations/types.ts` | Common adapter interface. |
| Slack adapter | `lib/integrations/slack/` | Sends approval/completion notifications. |
| Sentry adapter | `lib/integrations/sentry/` | Supplies error/issue context for incident correlation. |
| Datadog adapter | `lib/integrations/datadog/` | Supplies log enrichment. |
| Zendesk adapter | `lib/integrations/zendesk/` | Imports/simulates support tickets. |

## Data passed to next step

Tool outputs become state fields inside the investigation run. Examples:

- customer profile
- recent deployments
- log patterns
- related incidents
- retrieved knowledge chunks
- escalation notes

These are then available to later agents such as root-cause analysis and response drafting.

---

# 4. RAG Retrieval

## What happens

RAG retrieval finds relevant knowledge base chunks for the current ticket or query. This allows the agents to use company-specific runbooks, incident reports, support tickets, product docs, architecture docs, alerts, and log summaries.

The pipeline is roughly:

```txt
Ticket/query text
↓
embed query
↓
pgvector semantic search
↓
optional keyword fallback
↓
optional reranking
↓
return top chunks with [KB-N] citation labels
```

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Knowledge agent | `agents/nodes/knowledge-agent.ts` | Agent node that performs RAG search and returns top chunks into the investigation state. |
| Docs tool | `agents/tools/docs-tool.ts` | Tool wrapper around vector search/reranking. |
| Full retrieval pipeline | `lib/knowledge-retrieval.ts` | Embeds the query, searches pgvector, applies filters/fallbacks/reranking, assigns `[KB-N]` labels, and writes retrieval audit rows. |
| Vector search helpers | `lib/vector-search.ts` | Implements semantic and filtered knowledge search. |
| Reranker | `lib/reranker.ts` | Optional Hugging Face cross-encoder reranking with fallback behavior. |
| Knowledge API | `app/api/knowledge/retrieve/route.ts` | Ad-hoc retrieval endpoint returning evidence and optional `[KB-N]` block. |
| Ticket context API | `app/api/tickets/[ticketId]/retrieve-context/route.ts` | Auto-retrieves context for a ticket detail page. |
| Legacy search API | `app/api/search/route.ts` | Legacy pgvector RAG search endpoint. |

## Data passed to next step

RAG returns evidence objects, usually including:

- chunk ID
- document title
- source type
- product area/tags
- similarity score
- rerank score if available
- excerpt/content
- `[KB-N]` citation label

These retrieved chunks become the grounded evidence used by later agents.

---

# 5. Embeddings

## What happens

Embeddings convert text into vectors so that the app can perform semantic search.

There are two embedding moments:

1. **Ingestion time**: knowledge documents are chunked and embedded into the database.
2. **Query time**: the current ticket/query is embedded and compared against stored chunk vectors.

```txt
Markdown docs
↓
chunk text
↓
embed each chunk
↓
store vector in KnowledgeChunk.embedding
```

```txt
Current ticket/query
↓
embed query
↓
compare against stored KnowledgeChunk.embedding
```

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Embedding helper | `lib/embeddings.ts` | Defines `embedText()` using OpenAI `text-embedding-3-small`. |
| Knowledge chunker | `lib/knowledge-chunker.ts` | Heading-aware Markdown chunking with overlap. |
| Managed ingestion script | `scripts/knowledge-ingest.ts` | Walks `knowledge/**/*.md`, parses metadata, chunks docs, embeds chunks, and stores them. |
| Legacy ingestion script | `scripts/ingest-docs.ts` | Embeds legacy `knowledge-base/` documents. |
| Knowledge source docs | `knowledge/` | Managed Markdown knowledge base. |
| Legacy docs | `knowledge-base/` | Older Markdown knowledge base. |
| Prisma schema | `prisma/schema.prisma` | Defines `KnowledgeChunk.embedding` as a pgvector-backed vector. |
| Local DB | `docker-compose.yml` | Runs PostgreSQL + pgvector locally. |

## Data passed to next step

The stored embeddings are not displayed directly to users. They are used to calculate which chunks are semantically closest to the current ticket/query.

The resulting matched chunks become retrieved context.

---

# 6. Retrieved Context

## What happens

Retrieved context is the human-readable knowledge that gets inserted into the agent workflow after RAG.

Example format:

```txt
[KB-1] Database Failover Runbook (RUNBOOK · Infrastructure)
> Step 3: Promote the replica using pg_promote()...

[KB-2] Incident Report: DB Lag June 2024 (INCIDENT_REPORT)
> Root cause was a stale checkpoint on the primary...
```

The key idea is that the model does not read the entire database. It receives a selected, formatted subset of relevant chunks.

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Citation block builder | `lib/knowledge-retrieval.ts` | Assigns `[KB-N]` labels and formats evidence. |
| Knowledge agent | `agents/nodes/knowledge-agent.ts` | Inserts retrieved chunks into graph state. |
| Root cause agent | `agents/nodes/root-cause-agent.ts` | Uses retrieved evidence when ranking hypotheses. |
| Response agent | `agents/nodes/response-agent.ts` | Uses retrieved evidence when drafting customer-facing replies. |
| Evidence UI | `components/agents/evidence-panel.tsx` | Shows knowledge chunks, similarity scores, rerank scores, and evidence used in the investigation. |
| Ticket context UI | `components/knowledge/ticket-context-panel.tsx` | Shows top relevant knowledge on ticket detail pages. |

## Data passed to next step

The retrieved context becomes part of the LLM input. It affects output by making answers:

- more grounded
- more specific
- more likely to cite internal runbooks/docs
- less dependent on model memory
- easier to audit in the UI

---

# 7. Context Window

## What happens

The context window is the assembled input the LLM sees for a given agent call. It may include:

- system prompt
- current ticket
- customer context
- logs
- related incidents
- deployments
- retrieved knowledge snippets
- previous agent outputs
- required output format

In this app, the shared state passed between LangGraph nodes is defined centrally.

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Graph state types | `agents/state.ts` | Defines `InvestigationState` and shared types passed through the agent pipeline. |
| Graph orchestration | `agents/graph.ts` | Defines the LangGraph `StateGraph` pipeline and node order. |
| Inngest runner | `inngest/functions.ts` | Starts the graph run and handles background execution / approval waiting. |
| Agent nodes | `agents/nodes/*.ts` | Each node receives state, adds new data, and returns a state patch. |
| Agent step persistence | `prisma/schema.prisma` → `AgentStep` | Stores per-step input/output/token usage/tools for traceability. |
| Utility functions | `lib/agent-utils.ts` | Extracts token usage, estimates cost, formats cost. |

## Data passed to next step

Each agent returns a state patch such as:

```ts
return { fieldName: parsedResult }
```

That patch updates the shared investigation state. Later agents use that enriched state.

Example:

```txt
intake-agent returns category/severity
↓
customer-context-agent uses ticket/customer IDs
↓
knowledge-agent retrieves KB evidence
↓
root-cause-agent combines category + customer + logs + KB evidence
↓
response-agent drafts a customer reply from root-cause output
```

---

# 8. LLM

## What happens

The LLM is called inside individual agent nodes. Each node packages its prompt, input data, tool results, and output requirements into an OpenAI request.

The README describes a standard per-agent pattern:

```txt
create AgentStep as running
↓
call OpenAI chat completion
↓
extract token usage
↓
persist output/token usage
↓
return parsed result into graph state
```

## Main files/folders

| Agent node | Files/folders | Role |
|---|---|---|
| Intake | `agents/nodes/intake-agent.ts` | Classifies ticket category/severity. |
| Customer context | `agents/nodes/customer-context-agent.ts` | Fetches customer and deployment context. |
| Log analysis | `agents/nodes/log-analysis-agent.ts` | Analyzes error/log patterns. |
| Knowledge retrieval | `agents/nodes/knowledge-agent.ts` | Retrieves and summarizes relevant knowledge evidence. |
| Incident correlation | `agents/nodes/incident-correlation-agent.ts` | Matches related incidents/Sentry issues. |
| Deployment correlation | `agents/nodes/deployment-correlation-agent.ts` | Matches relevant deployments. |
| Root cause | `agents/nodes/root-cause-agent.ts` | Ranks hypotheses with confidence scores. |
| Response drafting | `agents/nodes/response-agent.ts` | Drafts customer-facing reply. |
| Guardrails | `agents/nodes/guardrails-agent.ts` | Checks and revises unsafe/problematic response content. |
| Escalation | `agents/nodes/escalation-agent.ts` | Produces internal escalation note and optionally posts to external systems. |

## Data passed to next step

The raw LLM response is parsed into typed/structured data. That parsed result is saved to:

- `AgentStep.output`
- relevant `InvestigationRun` fields
- LangGraph state for the next node

---

# 9. Structured Output

## What happens

The app does not treat the LLM response as only a paragraph. Each agent output is stored as structured data so the application can render it, audit it, score it, or pass it to later steps.

Examples of structured outputs:

- classified category/severity
- log pattern summaries
- evidence arrays
- root-cause hypotheses with confidence scores
- drafted customer reply
- guardrail flags
- escalation note
- token usage

## Main files/folders

| Area | Files/folders | Role |
|---|---|---|
| Shared types | `agents/state.ts` | Defines structured state and output types. |
| Database schema | `prisma/schema.prisma` | Persists structured investigation data. |
| InvestigationRun model | `prisma/schema.prisma` | Stores `hypotheses`, `summary`, `escalationNote`, `guardrailsResult`, `editedReply`, approval fields. |
| AgentStep model | `prisma/schema.prisma` | Stores `input`, `output`, `tokenUsage`, `toolsCalled`, `confidenceScore`, timing fields. |
| RetrievalResult model | `prisma/schema.prisma` | Stores retrieval query, returned chunk IDs, and scores. |
| Eval models | `prisma/schema.prisma` | Stores golden examples, eval runs, and eval results. |
| Guardrail rules | `lib/guardrails-rules.ts` | Produces typed guardrail flags. |
| Eval judge | `lib/eval-judge.ts` | Scores outputs across root cause, evidence, tone, hallucination dimensions. |

## Data passed to next step

Structured output enables deterministic application behavior.

For example:

```txt
root-cause-agent
↓
Hypothesis[] saved to InvestigationRun.hypotheses
↓
response-agent uses hypotheses to draft reply
↓
guardrails-agent checks draft
↓
approval UI displays draft and guardrail badges
```

Because fields are structured, the UI can render cards, badges, charts, score bars, timelines, and approval workflows without scraping free-form prose.

---

# 10. Application

## What happens

The application layer turns structured AI outputs into user-facing product features.

The user does not see the raw graph state or JSON as the final experience. They see investigation timelines, evidence panels, hypotheses, approval queues, incident banners, eval dashboards, and knowledge cards.

## Main files/folders

| Feature | Files/folders | Role |
|---|---|---|
| Investigation trace page | `app/(dashboard)/investigations/[runId]/page.tsx` | Shows full investigation result and agent trace. |
| Investigation list | `app/(dashboard)/investigations/page.tsx` | Shows all runs. |
| Agent timeline | `components/agents/agent-timeline.tsx` | Live pipeline status with polling. |
| Step detail drawer | `components/agents/step-detail-drawer.tsx` | Shows full step input/output/tools. |
| Evidence panel | `components/agents/evidence-panel.tsx` | Shows retrieved KB evidence. |
| Token usage badge | `components/agents/token-usage-badge.tsx` | Shows token/cost data. |
| Timing bar | `components/agents/pipeline-timing-bar.tsx` | Shows per-agent duration. |
| Guardrails badge | `components/agents/guardrails-badge.tsx` | Shows warn/block flags. |
| Hypothesis card | `components/agents/hypothesis-card.tsx` | Shows root-cause candidates. |
| Approval queue | `app/(dashboard)/approvals/page.tsx`, `components/approvals/approval-queue-table.tsx` | Shows runs awaiting review. |
| Approval detail/editor | `app/(dashboard)/approvals/[runId]/page.tsx`, `components/approvals/reply-editor.tsx` | Lets reviewer edit/approve/reject reply. |
| Approval API | `app/api/investigations/[runId]/approve/route.ts` | Saves approval audit, final reply, and resumes Inngest. |
| Incident UI | `app/(dashboard)/incidents/`, `components/incidents/` | Displays correlated incidents and status-page drafts. |
| Eval UI | `app/(dashboard)/eval/`, `components/eval/` | Shows eval run history, pass rate trend, and scoring breakdowns. |
| Knowledge UI | `app/(dashboard)/knowledge/`, `components/knowledge/` | Searchable knowledge library and document detail pages. |

## Final user-facing output

The user-facing output is shaped by every upstream step:

```txt
Better user/ticket input
→ better retrieval query
→ better retrieved context
→ better LLM reasoning
→ better structured output
→ better UI result
```

For example, the final investigation page can show:

- ticket classification
- customer context
- relevant KB evidence with `[KB-N]` citations
- related incidents
- deployment correlations
- root-cause hypotheses with confidence
- drafted customer reply
- guardrail status
- token/cost/timing telemetry
- approval status

---

# End-to-end file map by flow stage

| Flow stage | Primary files/folders |
|---|---|
| User | `app/(dashboard)/tickets/`, `components/tickets/`, `components/knowledge/ticket-context-panel.tsx` |
| System Prompt | `agents/prompts/*.md` |
| Tool Calling | `agents/tools/*.ts`, `lib/integrations/**` |
| RAG Retrieval | `agents/nodes/knowledge-agent.ts`, `agents/tools/docs-tool.ts`, `lib/knowledge-retrieval.ts`, `lib/vector-search.ts`, `lib/reranker.ts` |
| Embeddings | `lib/embeddings.ts`, `scripts/knowledge-ingest.ts`, `scripts/ingest-docs.ts`, `lib/knowledge-chunker.ts`, `prisma/schema.prisma` |
| Retrieved Context | `lib/knowledge-retrieval.ts`, `components/agents/evidence-panel.tsx`, `components/knowledge/ticket-context-panel.tsx` |
| Context Window | `agents/state.ts`, `agents/graph.ts`, `agents/nodes/*.ts`, `inngest/functions.ts` |
| LLM | `agents/nodes/*.ts`, `agents/prompts/*.md`, `lib/agent-utils.ts` |
| Structured Output | `agents/state.ts`, `prisma/schema.prisma`, `lib/guardrails-rules.ts`, `lib/eval-judge.ts` |
| Application | `app/(dashboard)/**`, `app/api/**`, `components/**` |

---

# Practical mental model for this repo

The app is not simply:

```txt
Ticket → LLM → Answer
```

It is closer to:

```txt
Ticket
↓
InvestigationRun created
↓
Inngest starts background job
↓
LangGraph runs specialized agents
↓
Tools fetch customer/log/doc/incident/deployment data
↓
RAG retrieves cited knowledge chunks
↓
LLM agents produce structured outputs
↓
Outputs are persisted as InvestigationRun + AgentStep records
↓
UI renders timeline, evidence, hypotheses, reply, guardrails, and approval workflow
```

This is why the project is a strong AI literacy portfolio piece: it demonstrates not only prompting, but production-style AI application architecture: orchestration, retrieval, embeddings, tool use, structured outputs, auditability, guardrails, evals, and human review.
