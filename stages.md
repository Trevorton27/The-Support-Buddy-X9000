# Signal-Ops AI v2 — Build Stages

| # | Name | Key Deliverables | Status |
|---|---|---|---|
| 1 | Schema Migration | `KnowledgeDocument` model, upgrade `KnowledgeChunk` (`documentId`, `tokenCount`, `metadata`), `RetrievalResult` model | ✅ Complete |
| 2 | Synthetic Sample Content | 50+ markdown files across `knowledge/runbooks/`, `tickets/`, `incidents/`, `product-docs/`, `architecture/`, `alerts/`, `logs/` | ✅ Complete |
| 2b | Public Documentation Fetcher | `scripts/knowledge-fetch-docs.ts`, `knowledge/external-docs/manifest.json`, GitHub-raw + HTML-fetch strategies, robots.txt compliance, 7-day disk cache | ✅ Complete |
| 3 | Ingestion Pipeline Upgrade | `lib/knowledge-chunker.ts`, `scripts/knowledge-ingest.ts`, `scripts/knowledge-reset.ts`, front-matter parser, heading-aware chunking, `KnowledgeDocument` upsert | ✅ Complete |
| 4 | Retrieval Service | `lib/knowledge-retrieval.ts`, `lib/vector-search.ts` (filtered + keyword overloads), `[KB-N]` citation labels, HuggingFace reranker, `RetrievalResult` audit writes | ✅ Complete |
| 5 | API Routes | `POST /api/knowledge/retrieve`, `GET /api/knowledge/documents`, `GET /api/knowledge/documents/[id]`, `POST /api/knowledge/ingest` (admin-only), `POST /api/tickets/[ticketId]/retrieve-context` | ✅ Complete |
| 6 | Agent Integration | `[KB-N]` evidence in `knowledge-agent.ts`, extend `KnowledgeChunk` state type, update `docs-tool.ts`, update `root-cause-agent.ts` + `response-agent.ts` + 3 prompt files | ⬜ Pending |
| 7 | Knowledge Library UI | `/knowledge` list page, `/knowledge/[id]` detail page, source-type badge colours, search + filter | ⬜ Pending |
| 8 | Ticket Context Panel | `components/knowledge/ticket-context-panel.tsx`, grouped evidence by source type, `[KB-N]` badges, relevance score bars, manual search input | ⬜ Pending |
| 9 | Evaluation Script | `scripts/knowledge-evaluate.ts`, `knowledge/evals/retrieval-eval.json` (20 queries), top-1/3/5 hit rate output | ⬜ Pending |
| 10 | README & Verification | README "RAG Knowledge Base" section, end-to-end `knowledge:seed` test, typecheck + lint pass | ⬜ Pending |
