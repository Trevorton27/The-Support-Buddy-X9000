# UI Test Runner Script

Run all 89 UI/UX interaction tests across 6 component test files with colored output, per-group timing, and a final summary.

## Quick Start

```bash
bash docs/run-ui-tests.sh
```

**Flags:**

| Flag | Effect |
|------|--------|
| *(none)* | Run all 6 UI test groups |
| `--skip-typecheck` | Skip Group 0 (TypeScript check) for faster iteration |
| `--only <name>` | Run a single group by name (e.g. `--only wizard-launcher`) |

---

## The Script

```bash
#!/usr/bin/env bash
# ============================================================
# Signal Ops AI — UI / UX Interaction Test Suite
# Usage: bash docs/run-ui-tests.sh [--skip-typecheck] [--only <group>]
# ============================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Flags ───────────────────────────────────────────────────
SKIP_TYPECHECK=false
ONLY_GROUP=""

for arg in "$@"; do
  case $arg in
    --skip-typecheck) SKIP_TYPECHECK=true ;;
    --only=*) ONLY_GROUP="${arg#*=}" ;;
    --only) shift; ONLY_GROUP="${1:-}" ;;
  esac
done

# ── State ───────────────────────────────────────────────────
declare -A GROUP_STATUS
declare -A GROUP_DURATION
ALL_PASS=true

# ── Helpers ─────────────────────────────────────────────────
banner() {
  echo ""
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

run_group() {
  local name="$1"
  local pattern="$2"
  local description="$3"

  [[ -n "$ONLY_GROUP" && "$ONLY_GROUP" != "$name" ]] && return

  banner "UI Group: $description"
  echo -e "  ${YELLOW}▶ Pattern:${RESET} $pattern"
  echo ""

  local start=$SECONDS
  local exit_code=0

  npx vitest run "$pattern" --reporter=verbose 2>&1 || exit_code=$?

  local elapsed=$(( SECONDS - start ))
  GROUP_DURATION["$name"]="${elapsed}s"

  if [[ $exit_code -eq 0 ]]; then
    GROUP_STATUS["$name"]="PASS"
    echo -e "\n  ${GREEN}✓ $description — PASSED${RESET} (${elapsed}s)"
  else
    GROUP_STATUS["$name"]="FAIL"
    ALL_PASS=false
    echo -e "\n  ${RED}✗ $description — FAILED${RESET} (${elapsed}s)"
  fi
}

# ── Group 0: TypeScript Check ────────────────────────────────
if [[ "$SKIP_TYPECHECK" == "false" ]]; then
  if [[ -z "$ONLY_GROUP" || "$ONLY_GROUP" == "typecheck" ]]; then
    banner "Group 0: TypeScript Strict Check"
    echo -e "  ${YELLOW}▶ Command:${RESET} npx tsc --noEmit"
    echo ""

    start=$SECONDS
    if npx tsc --noEmit 2>&1; then
      elapsed=$(( SECONDS - start ))
      GROUP_STATUS["typecheck"]="PASS"
      GROUP_DURATION["typecheck"]="${elapsed}s"
      echo -e "\n  ${GREEN}✓ TypeScript — PASSED${RESET} (${elapsed}s)"
    else
      elapsed=$(( SECONDS - start ))
      GROUP_STATUS["typecheck"]="FAIL"
      GROUP_DURATION["typecheck"]="${elapsed}s"
      ALL_PASS=false
      echo -e "\n  ${RED}✗ TypeScript — FAILED${RESET} (${elapsed}s)"
    fi
  fi
fi

# ── Group 1: DemoReset ───────────────────────────────────────
run_group "demo-reset" \
  "__tests__/ui/demo-reset" \
  "DemoReset Component (8 tests)"

# ── Group 2: IntegrationCard ─────────────────────────────────
run_group "integration-card" \
  "__tests__/ui/integration-card" \
  "IntegrationCard Component (16 tests)"

# ── Group 3: ReplyEditor ─────────────────────────────────────
run_group "reply-editor" \
  "__tests__/ui/reply-editor" \
  "ReplyEditor Component (14 tests)"

# ── Group 4: StatusPageEditor ────────────────────────────────
run_group "status-page-editor" \
  "__tests__/ui/status-page-editor" \
  "StatusPageEditor Component (12 tests)"

# ── Group 5: WizardLauncher ──────────────────────────────────
run_group "wizard-launcher" \
  "__tests__/ui/wizard-launcher" \
  "WizardLauncher Component (24 tests)"

# ── Group 6: AgentTimeline ───────────────────────────────────
run_group "agent-timeline" \
  "__tests__/ui/agent-timeline" \
  "AgentTimeline Component (15 tests)"

# ── Final Summary ────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  UI Test Suite Summary${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
printf "  %-26s %-8s %s\n" "Group" "Status" "Duration"
printf "  %-26s %-8s %s\n" "─────────────────────────" "──────" "────────"

for group in typecheck demo-reset integration-card reply-editor status-page-editor wizard-launcher agent-timeline; do
  [[ -z "${GROUP_STATUS[$group]+x}" ]] && continue
  status="${GROUP_STATUS[$group]}"
  dur="${GROUP_DURATION[$group]}"
  if [[ "$status" == "PASS" ]]; then
    printf "  %-26s ${GREEN}%-8s${RESET} %s\n" "$group" "✓ PASS" "$dur"
  else
    printf "  %-26s ${RED}%-8s${RESET} %s\n" "$group" "✗ FAIL" "$dur"
  fi
done

echo ""
if [[ "$ALL_PASS" == "true" ]]; then
  echo -e "  ${GREEN}${BOLD}All UI groups passed.${RESET}"
  exit 0
else
  echo -e "  ${RED}${BOLD}One or more UI groups failed. See output above.${RESET}"
  exit 1
fi
```

---

## Save and Run

1. Copy the script block above into `docs/run-ui-tests.sh`
2. Make it executable and run:

```bash
chmod +x docs/run-ui-tests.sh
bash docs/run-ui-tests.sh
```

---

## Run a Single Group

```bash
bash docs/run-ui-tests.sh --only wizard-launcher
bash docs/run-ui-tests.sh --only agent-timeline
bash docs/run-ui-tests.sh --only reply-editor
bash docs/run-ui-tests.sh --only status-page-editor
bash docs/run-ui-tests.sh --only demo-reset
bash docs/run-ui-tests.sh --only integration-card
```

## Skip TypeScript Check

```bash
bash docs/run-ui-tests.sh --skip-typecheck
```

## Run All UI Tests Directly with Vitest

```bash
# All 6 UI test files in one run
npx vitest run __tests__/ui --reporter=verbose

# Watch mode during active development
npx vitest watch __tests__/ui

# Single component file
npx vitest run __tests__/ui/wizard-launcher
```

---

## Expected Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Group 0: TypeScript Strict Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ▶ Command: npx tsc --noEmit

  ✓ TypeScript — PASSED (4s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  UI Group: DemoReset Component (8 tests)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ▶ Pattern: __tests__/ui/demo-reset

  ✓ DemoReset Component — PASSED (3s)

  ... (5 more groups) ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  UI Test Suite Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Group                      Status   Duration
  ───────────────────────── ──────── ────────
  typecheck                  ✓ PASS   4s
  demo-reset                 ✓ PASS   3s
  integration-card           ✓ PASS   3s
  reply-editor               ✓ PASS   3s
  status-page-editor         ✓ PASS   2s
  wizard-launcher            ✓ PASS   4s
  agent-timeline             ✓ PASS   3s

  All UI groups passed.
```

---

## Requirements

All packages should already be installed. If starting fresh:

```bash
npm install -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @vitejs/plugin-react
```

| Package | Purpose |
|---------|---------|
| `vitest` | Test runner |
| `jsdom` | Browser DOM emulation (per-file via `// @vitest-environment jsdom`) |
| `@testing-library/react` | Component rendering utilities |
| `@testing-library/user-event` | Realistic user interaction simulation |
| `@testing-library/jest-dom` | DOM matchers (`toBeInTheDocument`, `toBeDisabled`, etc.) |
| `@vitejs/plugin-react` | JSX transform support in Vitest with Rolldown |
