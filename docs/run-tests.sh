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

pass_group() { echo -e "${GREEN}  ✓ $1${RESET}"; GROUP_RESULTS+=("PASS|$1"); TOTAL_PASS=$((TOTAL_PASS + 1)); }
fail_group() { echo -e "${RED}  ✗ $1${RESET}"; GROUP_RESULTS+=("FAIL|$1"); TOTAL_FAIL=$((TOTAL_FAIL + 1)); }
skip_group() { echo -e "${YELLOW}  ⚠ $1 (skipped)${RESET}"; GROUP_RESULTS+=("SKIP|$1"); TOTAL_SKIP=$((TOTAL_SKIP + 1)); }

run_vitest() {
  local label="$1"; shift
  local start=$SECONDS
  if npx vitest run "$@" 2>&1; then
    pass_group "$label ($((SECONDS - start))s)"
  else
    fail_group "$label ($((SECONDS - start))s)"
  fi
}

# ── Group 1: TypeScript ───────────────────────────────────────────────────────
banner "Group 1 — TypeScript strict check"
if $SKIP_TYPECHECK; then
  skip_group "TypeScript (--skip-typecheck)"
else
  start=$SECONDS
  if npx tsc --noEmit 2>&1; then
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
