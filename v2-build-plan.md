# Signal-Ops AI v2 — RAG Knowledge Base Build Plan

## Overview

Implement a production-style RAG knowledge base layer for Signal-Ops AI so the app can retrieve
relevant support knowledge from runbooks, previous tickets, incident reports, product docs,
architecture docs, alerts, and processed logs. Preserve all existing architecture, UI, auth,
agents, database, and API patterns. Add incrementally.

---

## Phase Summary Table

| Phase | Name | Key Deliverables | Existing Code Touched | Risk |
|---|---|---|---|---|
| 1 | Schema Migration | `KnowledgeDocument` model, upgrade `KnowledgeChunk` (add `documentId`, `tokenCount`, `metadata`), add `RetrievalResult` model, `SourceType` string constants | `prisma/schema.prisma` only | Low |
| 2 | Synthetic Sample Content | 50+ markdown files across `knowledge/runbooks/`, `tickets/`, `incidents/`, `product-docs/`, `architecture/`, `alerts/`, `logs/` — all 8 source type domains | New files only | None |
| 2b | Public Documentation Fetcher | `scripts/knowledge-fetch-docs.ts`, `knowledge/external-docs/manifest.json`, GitHub raw fetcher (Clerk, Kubernetes), HTML fetcher (AWS, PostgreSQL, Vercel), robots.txt compliance, 7-day disk cache, `knowledge:fetch` + `knowledge:refresh` npm scripts | New files only; `.gitignore` update | Low |
| 3 | Ingestion Pipeline Upgrade | `scripts/knowledge-ingest.ts`, `lib/knowledge-chunker.ts`, source type detection from folder path, front-matter parser, improved chunking (800–1200 tokens, overlap, heading context), `KnowledgeDocument` upsert, linked `KnowledgeChunk` upsert, optional LLM summary, `knowledge:ingest` / `knowledge:seed` / `knowledge:reset` npm scripts | `package.json` (add scripts); existing `ingest-docs.ts` untouched | Low |
| 4 | Retrieval Service | `lib/knowledge-retrieval.ts` — `retrieveKnowledge(query, options)` with `sourceType`/`tag`/`productArea` filters, hybrid vector + keyword fallback, `[KB-N]` citation label assignment, `RetrievalResult` audit writes | `lib/vector-search.ts` (add filter overload) | Low |
| 5 | API Routes | `POST /api/knowledge/retrieve`, `GET /api/knowledge/documents`, `GET /api/knowledge/documents/[id]`, `POST /api/knowledge/ingest` (admin-only), `POST /api/tickets/[ticketId]/retrieve-context` | New route files only | Low |
| 6 | Agent Integration | Structured `[KB-N]` evidence format in `knowledge-agent.ts`, extend `KnowledgeChunk` state type with `documentId`/`sourceType`/`citationLabel`, update `docs-tool.ts` to call `retrieveKnowledge()`, update `root-cause-agent.ts` + `response-agent.ts` context blocks, update `knowledge-retrieval.md` + `root-cause.md` + `response-drafting.md` prompts with citation instructions | `agents/state.ts`, `agents/tools/docs-tool.ts`, `agents/nodes/knowledge-agent.ts`, `agents/nodes/root-cause-agent.ts`, `agents/nodes/response-agent.ts`, 3 prompt files | Medium |
| 7 | Knowledge Library UI | `app/(dashboard)/knowledge/page.tsx`, `app/(dashboard)/knowledge/[id]/page.tsx`, `components/knowledge/knowledge-library.tsx`, `components/knowledge/knowledge-document-detail.tsx`, source type badge colors, search + filter UI | `app/(dashboard)/layout.tsx` (add nav item) | Low |
| 8 | Ticket Context Panel | `components/knowledge/ticket-context-panel.tsx` — grouped evidence by source type, `[KB-N]` badges, relevance score bars, manual search input, link to `/knowledge/[id]` | `app/(dashboard)/tickets/[ticketId]/page.tsx` (add panel to grid) | Low |
| 9 | Evaluation Script | `scripts/knowledge-evaluate.ts`, `knowledge/evals/retrieval-eval.json` (20 queries + expected titles), top-1/top-3/top-5 hit rate output, miss report, `knowledge:evaluate` npm script | New files only | None |
| 10 | README & Verification | README "RAG Knowledge Base" section, `typecheck`, `lint`, `db:generate` confirmation, `knowledge:seed` end-to-end test, existing ticket workflow regression check | `README.md` only | None |

---

## Phase Detail

### Phase 1 — Schema Migration ✅ COMPLETE
**Status:** Done — schema pushed to Neon, Prisma client regenerated.

Changes made to `prisma/schema.prisma`:
- Added `KnowledgeDocument` model with `title`, `sourceType`, `sourceName`, `sourceUrl?`, `productArea?`, `customerSegment?`, `severity?`, `tags Json`, `content`, `summary?`, `filePath @unique`, `orgId`
- Upgraded `KnowledgeChunk`: added `documentId String?`, `tokenCount Int?`, `metadata Json?`, relation to `KnowledgeDocument`, `@@index([documentId])`
- Added `RetrievalResult` model with `query`, `matchedChunkIds Json`, `scoreMetadata Json`, optional FKs to `Ticket` and `InvestigationRun`
- Added `retrievalResults RetrievalResult[]` back-relation to `Ticket` and `InvestigationRun`

---

### Phase 2 — Synthetic Sample Content
**Status:** In progress

Directory: `/knowledge/`

Domains covered:
- API authentication, OAuth, SAML/SSO
- Webhook delivery failures
- Rate limiting
- Database connection issues
- Vercel deployment errors
- Clerk auth / middleware
- PostgreSQL performance
- CI/CD pipeline failures
- Docker/container issues
- AWS IAM / networking

File counts:
- `runbooks/` — 10 files
- `tickets/` — 10 files
- `incidents/` — 5 files
- `product-docs/` — 5 files
- `architecture/` — 5 files
- `alerts/` — 5 files
- `logs/` — 5 files

Document format:
```
# Title
**Source Type:** RUNBOOK
**Tags:** tag1, tag2
**Product Area:** Authentication
**Severity:** high

## Symptoms
## Possible Causes
## Investigation Steps
## Resolution
## Escalation Criteria
## Related References
```

---

### Phase 2b — Public Documentation Fetcher

New file: `scripts/knowledge-fetch-docs.ts`
New file: `knowledge/external-docs/manifest.json`

Sources:
- **Clerk** — GitHub raw MDX from `clerk/clerk-docs` (6 pages: auth overview, organizations, webhooks, middleware, roles, users)
- **Kubernetes** — GitHub raw MD from `kubernetes/website` (6 pages: containers, deployments, ingress, services, debug pods, debug services)
- **AWS** — HTML fetch from `docs.aws.amazon.com` (6 pages: IAM troubleshooting, IAM roles for EC2, VPC, ECS troubleshooting, Lambda errors, CloudWatch)
- **PostgreSQL** — HTML fetch from `postgresql.org/docs/current/` (5 pages: performance tips, indexes, stats collector, resource config, parallel query)
- **Vercel** — HTML fetch from `vercel.com/docs` (5 pages: deployments overview, env vars, functions, build step, framework errors)

Fetch strategies:
- `github-raw` — fetch raw markdown from GitHub CDN, strip MDX front-matter and JSX components
- `html-fetch` — fetch HTML, extract main content, convert headings/code to markdown

Safety:
- robots.txt checked once per domain, cached in memory
- User-Agent: `signal-ops-ai/1.0 (documentation-indexer)`
- 7-day disk cache via `.fetch-cache.json` sidecar
- Fetched `.md` files added to `.gitignore`

npm scripts added:
- `knowledge:fetch` — fetch only, write to disk
- `knowledge:refresh` — bypass cache, re-fetch all

---

### Phase 3 — Ingestion Pipeline Upgrade

New files:
- `scripts/knowledge-ingest.ts` — main ingestion script
- `lib/knowledge-chunker.ts` — improved chunking logic

Features:
- Source type detection from folder path
- Front-matter parser (reads `**Source Type:**`, `**Tags:**`, `**Product Area:**`, `**Severity:**`)
- Chunking: 800–1200 tokens, ~150-token overlap, heading context prepended
- `KnowledgeDocument` upsert on `filePath`
- `KnowledgeChunk` upsert on `[sourcePath, chunkIndex]` (preserves backward compat)
- Optional `gpt-4o-mini` summary generation per document
- Summary stats printed on completion

npm scripts added:
- `knowledge:ingest` — ingest all files in `/knowledge/`
- `knowledge:seed` — `knowledge:fetch` + `knowledge:ingest`
- `knowledge:reset` — delete all `KnowledgeDocument` + linked chunks, then re-ingest

Existing `npm run ingest` (legacy `knowledge-base/` path) untouched.

---

### Phase 4 — Retrieval Service

New file: `lib/knowledge-retrieval.ts`

Interface:
```ts
retrieveKnowledge(query: string, options: RetrieveOptions): Promise<RetrievedEvidence[]>

RetrieveOptions {
  sourceTypes?: string[]
  tags?: string[]
  productArea?: string
  severity?: string
  limit?: number          // default 5
  minScore?: number       // default 0.3
  ticketId?: string
  investigationRunId?: string
}

RetrievedEvidence {
  citationLabel: string   // "[KB-1]"
  chunkId: string
  documentId: string
  documentTitle: string
  sourceType: string
  sourceName: string
  sourceUrl?: string
  tags: string[]
  productArea?: string
  score: number
  rerankScore?: number
  contentExcerpt: string  // first 400 chars
  fullContent: string
}
```

Implementation: embed → vector search with metadata filters → keyword fallback if results sparse → rerank → assign [KB-N] labels → optionally write `RetrievalResult`

Modified: `lib/vector-search.ts` — add filter overload accepting `sourceTypes`, `tags`, `productArea`

---

### Phase 5 — API Routes

New route files (all follow existing auth patterns):

| Route | Method | Description |
|---|---|---|
| `app/api/knowledge/documents/route.ts` | GET | List documents — filter by `sourceType`, `tags`, `productArea`, `q`, paginate |
| `app/api/knowledge/documents/[id]/route.ts` | GET | Single document with chunks |
| `app/api/knowledge/retrieve/route.ts` | POST | Ad-hoc retrieval |
| `app/api/knowledge/ingest/route.ts` | POST | Admin-only: trigger ingestion |
| `app/api/tickets/[ticketId]/retrieve-context/route.ts` | POST | Ticket-specific retrieval + save RetrievalResult |

---

### Phase 6 — Agent Integration (HIGHEST RISK)

Files modified:
- `agents/state.ts` — extend `KnowledgeChunk` with `documentId?`, `documentTitle?`, `sourceType?`, `citationLabel?`
- `agents/tools/docs-tool.ts` — call `retrieveKnowledge()` instead of raw `searchKnowledge()`
- `agents/nodes/knowledge-agent.ts` — emit structured `[KB-N]` evidence blocks
- `agents/nodes/root-cause-agent.ts` — pass full citation block to context
- `agents/nodes/response-agent.ts` — pass full citation block to context
- `agents/prompts/knowledge-retrieval.md` — add citation instructions
- `agents/prompts/root-cause.md` — add `[KB-N]` citation rules
- `agents/prompts/response-drafting.md` — add `[KB-N]` citation rules

Evidence format agents receive:
```
[KB-1] Title: Webhook Delivery Troubleshooting Runbook
Source Type: RUNBOOK | Tags: webhook, authentication
Score: 0.87
Content: ...excerpt...
```

---

### Phase 7 — Knowledge Library UI

New files:
- `app/(dashboard)/knowledge/page.tsx` — Server Component, fetches documents
- `app/(dashboard)/knowledge/[id]/page.tsx` — Server Component, fetches document + chunks
- `components/knowledge/knowledge-library.tsx` — "use client", search + filter + document cards
- `components/knowledge/knowledge-document-detail.tsx` — "use client", full document view

Modified: `app/(dashboard)/layout.tsx` — add Knowledge nav item

Source type badge colors: RUNBOOK=blue, SUPPORT_TICKET=purple, INCIDENT_REPORT=red,
PRODUCT_DOC=green, ARCHITECTURE_DOC=teal, ALERT=amber, LOG_SUMMARY=slate, EXTERNAL_DOC=indigo

---

### Phase 8 — Ticket Context Panel

New file: `components/knowledge/ticket-context-panel.tsx` ("use client")
- Calls `POST /api/tickets/[ticketId]/retrieve-context` on mount
- Groups results by source type (Runbooks, Prior Tickets, Incidents, Docs)
- Shows `[KB-N]` citation badge, document title, score bar, content excerpt
- Manual "Search knowledge base..." input
- Links to `/knowledge/[id]`

Modified: `app/(dashboard)/tickets/[ticketId]/page.tsx` — add panel below InvestigationPanel

---

### Phase 9 — Evaluation Script

New files:
- `scripts/knowledge-evaluate.ts` — runs retrieval for each eval query, computes hit rates
- `knowledge/evals/retrieval-eval.json` — 20 queries with `expected_titles[]`

Output:
```
Top-1 hit rate:  X% (N/20)
Top-3 hit rate:  X% (N/20)
Top-5 hit rate:  X% (N/20)
```

npm script added: `knowledge:evaluate`

---

### Phase 10 — README & Verification

- README "RAG Knowledge Base" section added
- Verification checklist: typecheck, lint, db:generate, knowledge:seed, knowledge:evaluate, existing ticket workflow, /knowledge UI, /tickets/[id] context panel
