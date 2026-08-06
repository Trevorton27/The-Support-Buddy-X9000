# Signal Ops AI — Test Suite Reference

## 1. Introduction & Test Philosophy

The test suite is organized in layers from fastest (zero deps) to slowest (DB contact). Every test that touches external systems (LLM, Postgres) is either mocked or gated behind `--skip-integration`. CI runs all non-integration groups on every push; integration checks run nightly.

**Guiding principles:**
- No test makes a real LLM call — all generation/scoring functions are mocked
- No test needs a running Postgres — all DB access goes through `vi.mock('@/lib/db')`
- API route handlers are imported directly and called with a constructed `NextRequest` — no HTTP server required
- Tests that already pass are never modified unless a refactor forces it

---

## 2. Running the Tests

```bash
# All groups (requires .env.local for Group 7 only)
bash docs/run-tests.sh

# Skip type-check + lint (fastest iteration loop)
bash docs/run-tests.sh --skip-typecheck

# Skip DB schema check (works without .env.local)
bash docs/run-tests.sh --skip-integration

# Run a single group directly
npx vitest run __tests__/knowledge-chunker __tests__/generation-params
npx vitest run __tests__/incident-clustering __tests__/reranker __tests__/dataset-exporter
npx vitest run __tests__/api-routes

# Watch mode for a specific file
npx vitest watch __tests__/reranker.test.ts
```

---

## 3. Test Execution Order

| Group | Contents | Typical Duration |
|-------|----------|------------------|
| 1 | TypeScript strict check (`tsc --noEmit`) | 10–20s |
| 2 | ESLint (`next lint --max-warnings=0`) | 5–10s |
| 3 | Existing unit tests (utils, guardrails, agent-utils) | <2s |
| 4 | Pure function unit tests (knowledge-chunker, generation-params) | <1s |
| 5 | Mocked unit tests (clustering, reranker, exporter) | <1s |
| 6 | API route unit tests (generate-batches, training-score handlers) | <2s |
| 7 | DB schema check (`db:push`) — requires `.env.local` | 5–15s |

---

## 4. Group 1 — Static Checks: TypeScript

**Command:** `npx tsc --noEmit`

Verifies strict-mode TypeScript compiles cleanly. Catches:
- Missing types on new state fields
- Incorrect return types from agent nodes
- Invalid Prisma model field access

**Why this matters:** The codebase runs in strict mode with no implicit `any`. TypeScript errors caught here would be runtime errors in production.

---

## 5. Group 2 — Static Checks: ESLint

**Command:** `npm run lint -- --max-warnings=0`

**Why this matters:** Catches unused imports, React hook violations, and Next.js App Router anti-patterns before they reach review.

---

## 6. Group 3 — Existing Unit Tests

**Files:**

| File | Tests | Purpose |
|------|-------|---------|
| `__tests__/utils.test.ts` | 18 | `cn()`, `formatDuration()`, `truncate()`, `slugify()`, `formatRelativeTime()`, `severityColor()` |
| `__tests__/guardrails-rules.test.ts` | 14 | PII/secret/internal regex detection |
| `__tests__/agent-utils.test.ts` | 16 | `extractTokenUsage()`, `estimateCostUsd()` |

**Command:** `npx vitest run __tests__/utils __tests__/guardrails-rules __tests__/agent-utils`

**Why this matters:** These cover the core utility layer that every agent node and API route depends on. Regressions here would affect the entire pipeline.

---

## 7. Group 4 — Pure Function Unit Tests

No mocks required. Tests exercise deterministic functions with no I/O.

### `__tests__/knowledge-chunker.test.ts` (9 tests)

**Under test:** `lib/knowledge-chunker.ts::chunkMarkdown()`

| Test | Description |
|------|-------------|
| returns empty array for empty string | Guard against empty-content edge case |
| single chunk when content < target size | Content shorter than 3200 chars stays as one chunk |
| shape of returned ChunkResult objects | Each result has `content`, `heading`, `tokenCount` |
| splits on double-newline, not mid-sentence | Paragraph boundaries preserved with small `targetChars` |
| tokenCount > 0 for non-empty chunks | Sanity check on token estimation |
| extracts heading as metadata | `## Section` heading is captured in `heading` field |
| heading is null when no heading precedes | Content without a heading gets `heading: null` |
| strips metadata header lines | `**Source Type:**`, `**Tags:**`, etc. removed from content |
| multiple chunks produced for large content | Content > 3200 chars creates multiple results |

**Command:** `npx vitest run __tests__/knowledge-chunker`

### `__tests__/generation-params.test.ts` (13 tests)

**Under test:** `lib/generation/schema.ts::GenerationParamsSchema` (Zod)

| Test | Description |
|------|-------------|
| valid minimal params pass | Baseline valid input succeeds |
| count: 0 fails | Below min of 1 |
| count: 201 fails | Above max of 200 |
| count: 200 passes (boundary) | Max boundary accepted |
| mode: 'invalid' fails | Enum enforcement |
| missing products fails | Required array absent |
| empty products fails | `min(1)` on array enforced |
| severityWeights value > 100 fails | Per-key max(100) enforced |
| noiseLevel: 'extreme' fails | Unknown enum value rejected |
| incidentScenario.ticketCount < 2 fails | Min(2) on nested field |
| realism.herringCount: 4 fails | Above max(3) |
| optional customerId absent — passes | Optional field omission allowed |
| realism defaults applied on empty object | `.default()` coercions work |

**Command:** `npx vitest run __tests__/generation-params`

---

## 8. Group 5 — Mocked Unit Tests

All external I/O (Prisma, fetch) is replaced with `vi.mock()` / `vi.stubGlobal()`.

### `__tests__/incident-clustering.test.ts` (8 tests)

**Under test:** `lib/incident-clustering.ts::suggestClusters()`

**Mock strategy:** `vi.mock('@/lib/db', () => ({ prisma: { ticket: { findMany: vi.fn() } } }))`

| Test | Description |
|------|-------------|
| returns [] when no tickets | Empty DB |
| returns [] when all tickets have different products | No grouping possible |
| groups 3 same-product/category/region tickets within 4h | Core clustering logic |
| does NOT cluster tickets spread over 5 hours | Window boundary enforced |
| creates separate clusters for different regions | Region is part of group key |
| creates separate clusters for different categories | Category is part of group key |
| affectedProduct and affectedRegion set correctly | Cluster metadata is accurate |
| ticketIds length matches input count | All tickets in window are included |

**Command:** `npx vitest run __tests__/incident-clustering`

### `__tests__/reranker.test.ts` (7 tests)

**Under test:** `lib/reranker.ts::rerankChunks()`

**Mock strategy:** `vi.mock('@/lib/env')` to control API key; `vi.stubGlobal('fetch', vi.fn())` to control HTTP

| Test | Description |
|------|-------------|
| returns original order when key absent | Graceful fallback, no fetch |
| returns original order when fetch throws | Network error handled silently |
| returns original order on non-200 status | API error handled silently |
| reorders chunks by descending score on success | Core reranking logic |
| second call with same key does not re-fetch | 5-min cache works |
| different query triggers new fetch | Cache key includes query |
| empty chunks returns empty immediately | Short-circuit before fetch |

**Command:** `npx vitest run __tests__/reranker`

### `__tests__/dataset-exporter.test.ts` (13 tests)

**Under test:** `lib/generation/dataset-exporter.ts` — `exportBatchAsCsv`, `exportBatchAsJson`, `exportBatchAsMarkdown`

**Mock strategy:** `vi.mock('@/lib/db')` with `prisma.generationBatch.findUnique` and `prisma.generatedTicketMeta.findMany`

#### CSV (6 tests)

| Test | Description |
|------|-------------|
| header row contains all 18 columns in order | Schema contract test |
| value with comma wrapped in double-quotes | RFC 4180 compliance |
| value with double-quote escaped as `""` | RFC 4180 compliance |
| value with newline wrapped in double-quotes | RFC 4180 compliance |
| injectedFaults array uses pipe separator | Array serialization contract |
| null values serialize as empty string | Null handling |

#### JSON (3 tests)

| Test | Description |
|------|-------------|
| top-level has `batch` and `tickets` keys | Structure contract |
| `tickets` array length matches mock count | Row count correct |
| all ground-truth fields present | `trueRootCause`, `trueCategory`, `trueSeverity`, `injectedFaults` |

#### Markdown (4 tests)

| Test | Description |
|------|-------------|
| starts with `# Batch Export:` | Top-level header present |
| each ticket appears as `## {title}` | Per-ticket section headers |
| Ground Truth section appears | `### Ground Truth` and `**True Root Cause:**` |
| injectedFaults tagged when non-empty | Fault list rendered |
| injectedFaults line omitted when empty | No orphan header |

**Command:** `npx vitest run __tests__/dataset-exporter`

---

## 9. Group 6 — API Route Unit Tests

Handlers imported directly via their module path. Each test constructs a `NextRequest` and asserts the response status and body.

**Mocks:** `@/lib/db`, `@/lib/auth`, `@/inngest/client`, `@clerk/nextjs/server`, `@/lib/generation/ticket-generator`, `@/lib/generation/training-scorer`

### `__tests__/api-routes.test.ts` (15 tests)

#### `POST /api/generate/batches` (6 tests)

| Test | Description |
|------|-------------|
| 401 when no userId | Auth guard |
| 400 on malformed JSON | JSON parse error |
| 400 when mode missing | Zod validation |
| 422 when no customers in DB | Pre-condition check |
| 201 + `{ batchId, ticketIds, status: "complete" }` on sync batch | Happy path (count ≤ 25) |
| 202 + `{ status: "pending" }` on large batch | Inngest async path (count > 25) |

#### `GET /api/generate/batches/[batchId]` (2 tests)

| Test | Description |
|------|-------------|
| 404 when batch not in org | Org-scoped access control |
| 200 with nested `metas` when found | Response shape |

#### `GET /api/generate/batches/[batchId]/export` (2 tests)

| Test | Description |
|------|-------------|
| CSV Content-Type + Content-Disposition when `format=csv` | Header contract |
| JSON by default when no format param | Default format |

#### `POST /api/training/score` (3 tests)

| Test | Description |
|------|-------------|
| 401 when unauthenticated | Auth guard |
| 422 when run has no generatedMeta | Pre-condition: not a training ticket |
| 200 with scores on valid run | Happy path |

#### `GET /api/training/leaderboard` (2 tests)

| Test | Description |
|------|-------------|
| `{ stats: [] }` when no scored metas | Empty DB |
| stats grouped by difficulty | Aggregation logic |

**Command:** `npx vitest run __tests__/api-routes`

---

## 10. Group 7 — Integration Checks

**Command:** `npm run db:push -- --accept-data-loss`

Requires a running Postgres with pgvector (local Docker Compose or Neon). Verifies that `prisma/schema.prisma` can sync cleanly — catches schema drift before migration.

**Skip flag:** `bash docs/run-tests.sh --skip-integration`

---

## 11. Coverage Gaps

The following areas are intentionally not covered by automated tests and why:

| Area | Reason not tested |
|------|-------------------|
| Agent nodes (`agents/nodes/`) | Require live OpenAI API; covered by eval suite |
| `lib/generation/ticket-generator.ts` | Calls `gpt-4o` — mocked at boundary in API route tests |
| `lib/generation/training-scorer.ts` | Calls `gpt-4o-mini` — mocked at boundary |
| Inngest functions (`inngest/functions.ts`) | Require Inngest dev server; covered by E2E flow |
| React components (`components/`) | No Vitest DOM setup; covered by manual UI checklist (`docs/manual-tests.md`) |
| Auth middleware (`middleware.ts`) | Clerk middleware tested against real Clerk in staging |
| `lib/embeddings.ts` | Calls OpenAI embeddings API |
| Vector search (`lib/vector-search.ts`) | Requires live pgvector |

---

## 12. Terminal Script

The script below is also saved as `docs/run-tests.sh`.

```bash
#!/usr/bin/env bash
# Signal Ops AI — Full Automated Test Suite
# Usage: bash docs/run-tests.sh [--skip-typecheck] [--skip-integration]

set -euo pipefail

# ── Color codes ──────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Flags ────────────────────────────────────────────────────────────────────
SKIP_TYPECHECK=false
SKIP_INTEGRATION=false
for arg in "$@"; do
  case $arg in
    --skip-typecheck) SKIP_TYPECHECK=true ;;
    --skip-integration) SKIP_INTEGRATION=true ;;
  esac
done

# ── Counters ─────────────────────────────────────────────────────────────────
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
OVERALL_START=$SECONDS
declare -a GROUP_RESULTS=()

# ── Helpers ──────────────────────────────────────────────────────────────────
banner() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

pass_group() { echo -e "${GREEN}  ✓ $1${RESET}"; GROUP_RESULTS+=("PASS|$1"); }
fail_group() { echo -e "${RED}  ✗ $1${RESET}"; GROUP_RESULTS+=("FAIL|$1"); TOTAL_FAIL=$((TOTAL_FAIL + 1)); }
skip_group() { echo -e "${YELLOW}  ⚠ $1 (skipped)${RESET}"; GROUP_RESULTS+=("SKIP|$1"); TOTAL_SKIP=$((TOTAL_SKIP + 1)); }

run_vitest() {
  local label="$1"; shift
  local start=$SECONDS
  if npx vitest run "$@" 2>&1; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
    pass_group "$label (${$((SECONDS - start))}s)"
  else
    fail_group "$label (${$((SECONDS - start))}s)"
  fi
}

# ── Group 1: TypeScript ───────────────────────────────────────────────────────
banner "Group 1 — TypeScript strict check"
if $SKIP_TYPECHECK; then
  skip_group "TypeScript (--skip-typecheck)"
else
  start=$SECONDS
  if npx tsc --noEmit 2>&1; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
    pass_group "tsc --noEmit ($((SECONDS - start))s)"
  else
    fail_group "tsc --noEmit ($((SECONDS - start))s)"
  fi
fi

# ── Group 2: ESLint ───────────────────────────────────────────────────────────
banner "Group 2 — ESLint"
if $SKIP_TYPECHECK; then
  skip_group "ESLint (--skip-typecheck)"
else
  start=$SECONDS
  if npm run lint -- --max-warnings=0 2>&1; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
    pass_group "ESLint ($((SECONDS - start))s)"
  else
    fail_group "ESLint ($((SECONDS - start))s)"
  fi
fi

# ── Group 3: Existing unit tests ─────────────────────────────────────────────
banner "Group 3 — Existing unit tests (utils, guardrails, agent-utils)"
run_vitest "Existing unit tests" \
  __tests__/utils.test.ts \
  __tests__/guardrails-rules.test.ts \
  __tests__/agent-utils.test.ts

# ── Group 4: Pure function unit tests ────────────────────────────────────────
banner "Group 4 — Pure function unit tests (knowledge-chunker, generation-params)"
run_vitest "Pure function tests" \
  __tests__/knowledge-chunker.test.ts \
  __tests__/generation-params.test.ts

# ── Group 5: Mocked unit tests ───────────────────────────────────────────────
banner "Group 5 — Mocked unit tests (clustering, reranker, exporter)"
run_vitest "Mocked unit tests" \
  __tests__/incident-clustering.test.ts \
  __tests__/reranker.test.ts \
  __tests__/dataset-exporter.test.ts

# ── Group 6: API route unit tests ─────────────────────────────────────────────
banner "Group 6 — API route unit tests"
run_vitest "API route tests" \
  __tests__/api-routes.test.ts

# ── Group 7: DB schema check ──────────────────────────────────────────────────
banner "Group 7 — DB schema check (db:push)"
if $SKIP_INTEGRATION; then
  skip_group "DB schema check (--skip-integration)"
else
  start=$SECONDS
  output=$(npm run db:push -- --accept-data-loss 2>&1)
  if echo "$output" | grep -qE "Your database is now in sync|already in sync"; then
    TOTAL_PASS=$((TOTAL_PASS + 1))
    pass_group "DB schema in sync ($((SECONDS - start))s)"
  else
    echo "$output"
    fail_group "DB schema check failed ($((SECONDS - start))s)"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL_DURATION=$((SECONDS - OVERALL_START))
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  Test Suite Summary${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
printf "  %-50s %s\n" "Group" "Status"
printf "  %-50s %s\n" "─────────────────────────────────────────────────" "──────"
for result in "${GROUP_RESULTS[@]}"; do
  status="${result%%|*}"
  label="${result#*|}"
  if [[ "$status" == "PASS" ]]; then
    printf "  ${GREEN}%-50s PASS${RESET}\n" "$label"
  elif [[ "$status" == "FAIL" ]]; then
    printf "  ${RED}%-50s FAIL${RESET}\n" "$label"
  else
    printf "  ${YELLOW}%-50s SKIP${RESET}\n" "$label"
  fi
done
echo ""
echo -e "  Groups passed: ${GREEN}${TOTAL_PASS}${RESET}  failed: ${RED}${TOTAL_FAIL}${RESET}  skipped: ${YELLOW}${TOTAL_SKIP}${RESET}  duration: ${TOTAL_DURATION}s"
echo ""

if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo -e "${RED}${BOLD}  FAILED — $TOTAL_FAIL group(s) did not pass${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}  ALL GROUPS PASSED${RESET}"
  exit 0
fi
```
