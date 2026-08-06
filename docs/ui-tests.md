# Signal Ops AI — UI/UX Test Suite Reference

## 1. Introduction & Test Philosophy

The UI test suite verifies that every interactive element in the application behaves correctly from the user's perspective. Tests simulate real browser interactions — clicks, typing, form submission, navigation — using React Testing Library and `@testing-library/user-event` running against a real jsdom DOM.

**Guiding principles:**
- No test touches a real server, database, or API — all `fetch` calls are intercepted with `vi.stubGlobal("fetch", vi.fn())`
- Every test renders one component in isolation and drives it through user interactions
- Assertions target what the user actually sees (text, button states, visible/hidden elements) — not internal state or implementation details
- `next/navigation` (`useRouter`, `usePathname`) is mocked so components that redirect or refresh can be rendered without a Next.js runtime
- `window.confirm` is mocked for components that use the browser confirm dialog
- RTL auto-cleanup runs after each test — no DOM leaks between tests

**Environment:** Each UI test file uses `// @vitest-environment jsdom` at the top. The global Vitest config (`vitest.config.ts`) uses `environment: "node"` for all other tests, so there is zero risk of DOM state leaking into unit or API route tests.

---

## 2. Running the Tests

```bash
# All UI tests at once
npx vitest run __tests__/ui/

# A single component file
npx vitest run __tests__/ui/reply-editor.test.tsx

# Watch mode while developing a component
npx vitest watch __tests__/ui/wizard-launcher.test.tsx

# Full UI test run with the script (colored output, timed)
bash docs/run-ui-tests.sh

# Skip tsc/lint for fastest iteration
bash docs/run-ui-tests.sh --skip-typecheck
```

---

## 3. Test Files at a Glance

| File | Component | Tests | Key interactions covered |
|------|-----------|-------|--------------------------|
| `demo-reset.test.tsx` | `DemoReset` | 8 | Confirm dialog, POST /api/seed, loading + disabled state, success/error messages |
| `integration-card.test.tsx` | `IntegrationCard` | 16 | Live/mock badge, env hint, Test Connection click, result display, disabled during request |
| `reply-editor.test.tsx` | `ReplyEditor` | 14 | Draft editing, edited indicator, approve/reject POST body, reviewer note, redirect, error |
| `status-page-editor.test.tsx` | `StatusPageEditor` | 12 | Preview toggle, Edit toggle, PATCH save, Saving.../Saved! states, disabled during save |
| `wizard-launcher.test.tsx` | `WizardLauncher` | 24 | 5-step navigation, mode selection, product/category toggle, review summary, generation submit |
| `agent-timeline.test.tsx` | `AgentTimeline` | 15 | Pipeline labels, step states, drawer open/close, backdrop click, error messages |
| **Total** | | **89** | |

---

## 4. `DemoReset` — `__tests__/ui/demo-reset.test.tsx`

**Component:** `components/settings/demo-reset.tsx`
**What it does:** Shows a reset button that calls `POST /api/seed` after a browser confirm dialog, then displays the result.

**Mock setup:**
```ts
vi.stubGlobal("fetch", vi.fn());
vi.stubGlobal("confirm", vi.fn());
```

| # | Test | What is asserted |
|---|------|------------------|
| 1 | renders the description and reset button | Description paragraph and "Reset Demo Database" button are in the DOM |
| 2 | does not call fetch when user cancels confirm | `confirm` returns false → `fetch` never called |
| 3 | calls POST /api/seed when user confirms | `confirm` returns true → `fetch` called with `{ method: "POST" }` |
| 4 | shows 'Resetting…' while request is in flight | Button label changes to "Resetting…" before the promise resolves |
| 5 | button is disabled while resetting | `disabled` attribute present on the button during the pending request |
| 6 | displays success message from API response | `data.message` text from API appears in a green box |
| 7 | displays error message when fetch throws | Network-level error shows "Reset failed" fallback text |
| 8 | re-enables the button after request completes | Button is no longer disabled after the response arrives |

---

## 5. `IntegrationCard` — `__tests__/ui/integration-card.test.tsx`

**Component:** `components/settings/integration-card.tsx`
**What it does:** Shows a card per integration with live/mock status, an optional "Test Connection" button, and an env variable hint in mock mode.

**Mock setup:**
```ts
vi.stubGlobal("fetch", vi.fn());
```

### Status badge (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 1 | shows 'mock' badge when isLive is false | Badge text is "mock" |
| 2 | shows 'live' badge when isLive is true | Badge text is "live" |

### Card content (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 3 | renders the integration name | The `name` prop text is visible |
| 4 | renders the description | The `description` prop text is visible |

### Mock mode hint (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 5 | shows env variable hint in mock mode | `SLACK_API_TOKEN` code element is visible |
| 6 | does not show env variable hint in live mode | No env token hint when `isLive=true` |

### Last sync time (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 7 | shows last sync when provided | "Last sync:" text present when `lastSyncAt` is set |
| 8 | does not show last sync when not provided | "Last sync" text absent when prop is omitted |

### Test Connection button (8 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 9 | renders button when testEndpoint is provided | Button present when prop is set |
| 10 | no button when testEndpoint is absent | Button absent when prop is omitted |
| 11 | calls testEndpoint with POST when clicked | `fetch` called with the exact endpoint URL and `{ method: "POST" }` |
| 12 | shows success message when ok:true | `data.message` appears in green when API returns `ok: true` |
| 13 | shows error message when ok:false | `data.message` appears in red when API returns `ok: false` |
| 14 | shows 'Request failed' when fetch throws | Network error shows fallback message |
| 15 | button disabled during test request | Button has `disabled` attribute while the promise is pending |
| 16 | re-enables button after test completes | Button is no longer disabled after the response |

---

## 6. `ReplyEditor` — `__tests__/ui/reply-editor.test.tsx`

**Component:** `components/approvals/reply-editor.tsx`
**What it does:** The HITL approval UI. Shows the AI-drafted reply, lets reviewers edit it, add a note, then approve or reject — which POSTs to `/api/investigations/{runId}/approve`.

**Mock setup:**
```ts
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }));
vi.stubGlobal("fetch", vi.fn());
```

### Initial render (3 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 1 | shows the original draft in the reply textarea | Textarea value matches `originalDraft` prop |
| 2 | does not show 'Draft edited' indicator initially | Edited indicator element is absent |
| 3 | renders Approve & Send and Reject buttons | Both action buttons are in the DOM |

### Draft editing (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 4 | shows 'Draft edited' indicator when reply is changed | Blue indicator appears after any text change |
| 5 | indicator disappears when text is reverted to original | Indicator absent again when user types back the exact original |

### Approve action (5 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 6 | POSTs with action:approved on Approve click | `fetch` body contains `"action":"approved"` |
| 7 | sends editedReply in body only when draft is modified | `body.editedReply` is set only after the user has changed the text |
| 8 | does not send editedReply when draft is unchanged | `body.editedReply` is undefined on unmodified approve |
| 9 | includes reviewer note when note field is filled | `body.note` contains the typed note text |
| 10 | does not send note when field is empty | `body.note` is undefined when note textarea is blank |

### Reject action (1 test)

| # | Test | What is asserted |
|---|------|------------------|
| 11 | POSTs with action:rejected on Reject click | `body.action` is `"rejected"` |

### Loading state (1 test)

| # | Test | What is asserted |
|---|------|------------------|
| 12 | disables both buttons while submitting | Both Approve and Reject buttons have `disabled` during the pending request |

### Navigation (1 test)

| # | Test | What is asserted |
|---|------|------------------|
| 13 | redirects to /approvals after successful approval | `router.push("/approvals")` is called after a 200 response |

### Error handling (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 14 | shows error message when API returns non-ok status | Error text from `data.error` appears on screen |
| 15 | re-enables buttons after an error | Approve button is no longer disabled after the error is shown |

---

## 7. `StatusPageEditor` — `__tests__/ui/status-page-editor.test.tsx`

**Component:** `components/incidents/status-page-editor.tsx`
**What it does:** Lets operators write a customer-facing status page message for an incident. Supports a live Preview mode and saves via `PATCH /api/incidents/{id}`.

**Mock setup:**
```ts
vi.stubGlobal("fetch", vi.fn());
```

### Initial render (4 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 1 | renders textarea with the initial message | Textarea value matches `initialMessage` prop |
| 2 | renders with empty textarea when initialMessage is null | Textarea value is empty string |
| 3 | shows Save Message button | Save button is in the DOM |
| 4 | shows Preview button | Preview toggle button is in the DOM |

### Preview toggle (5 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 5 | Preview hides textarea and shows message content | Textarea removed; message text appears in preview div |
| 6 | shows 'No message set' when message is empty | Italic placeholder text appears when message is empty |
| 7 | Preview button label changes to 'Edit' in preview mode | Button label toggles |
| 8 | clicking Edit returns to edit mode with textarea | Textarea is back in the DOM |
| 9 | preview reflects changes made in edit mode | Edited text is shown in the preview div |

### Save action (4 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 10 | calls PATCH /api/incidents/{id} with the message | `fetch` called with correct URL, method, and body |
| 11 | button text changes to 'Saving…' during the request | Button label changes while the promise is pending |
| 12 | shows 'Saved!' text after successful save | "Saved!" appears in the button label after the response |
| 13 | 'Status page updated' label appears after save | Confirmation text appears below the Save button |

### Button states (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 14 | button is disabled while saving | `disabled` attribute present while the request is pending |
| 15 | re-enables save button after completion | Save button is no longer disabled after the response |

---

## 8. `WizardLauncher` — `__tests__/ui/wizard-launcher.test.tsx`

**Component:** `components/generate/wizard-launcher.tsx`
**What it does:** A 5-step wizard for configuring and launching a ticket generation batch. Steps: Mode → Config → Realism → Customer → Review & Generate.

**Mock setup:**
```ts
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: vi.fn() }) }));
vi.stubGlobal("fetch", vi.fn());
```

### Step indicator (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 1 | renders all 5 step labels | "Mode", "Config", "Realism", "Customer", "Review" all visible |
| 2 | starts on step 1 (Mode selection) | "Select generation mode" heading is visible |

### Step navigation (4 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 3 | clicking Next advances from step 1 to step 2 | "Configure tickets" heading appears |
| 4 | clicking Back from step 2 returns to step 1 | "Select generation mode" heading reappears |
| 5 | clicking a completed step pill navigates back | Clicking the "Mode" pill from step 2 returns to step 1 |
| 6 | can navigate through all 5 steps with Next | "Review & Generate" heading visible after 4 Next clicks |

### Mode selection — step 1 (3 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 7 | wizard mode is selected by default | "wizard" card has `border-blue-500` class |
| 8 | clicking 'autonomous' makes it active | "autonomous" card has `border-blue-500` class |
| 9 | clicking 'incident' makes it active | "incident" card has `border-blue-500` class |

### Config step — step 2 (4 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 10 | renders product toggle buttons | "Auth Service" and "Database Cluster" buttons visible |
| 11 | clicking a selected product deselects it | "Auth Service" loses `bg-blue-600` class after click |
| 12 | clicking an unselected product selects it | "Database Cluster" gains `bg-blue-600` class after click |
| 13 | Next disabled when all products deselected | Next button has `disabled` when product list is empty |

### Realism step — step 3 (3 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 14 | renders the Misleading logs toggle | "Misleading logs" text visible |
| 15 | renders all 4 noise level buttons | "none", "low", "medium", "high" buttons all visible |
| 16 | clicking a noise level selects it | Clicked button has `bg-blue-600` class |

### Customer step — step 4 (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 17 | renders the customer dropdown | `<select>` combobox is in the DOM |
| 18 | shows all customers in the dropdown | Both customer name/company strings are visible |

### Review step — step 5 (5 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 19 | shows the mode in the review summary | "wizard" badge text visible in summary |
| 20 | shows generate button with ticket count | Button label includes "Generate 5 tickets" |
| 21 | generate button disabled while loading | Button has `disabled` during pending request |
| 22 | navigates to batch detail page on success | `router.push` called with `/generate/batches/{batchId}` |
| 23 | shows error message when generation fails | API error text appears below the summary |

---

## 9. `AgentTimeline` — `__tests__/ui/agent-timeline.test.tsx`

**Component:** `components/agents/agent-timeline.tsx`
**What it does:** The live investigation pipeline visualization. Renders 10 sequential/parallel agent steps, shows status icons, clicking completed steps opens the `StepDetailDrawer` slide-over.

**Mock setup:**
```ts
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(STEP_JSON, { status: 200 })));
// STEP_JSON is a valid serialized AgentStep so StepDetailDrawer renders without errors
```

### Pipeline stage labels (3 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 1 | renders all 10 pipeline stage labels | All labels from "Ticket Classification" → "Escalation Note" visible |
| 2 | renders 'Running in parallel' label | Parallel group indicator is in the DOM |
| 3 | renders 'Agent Pipeline' heading | Section heading is visible |

### Step states (5 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 4 | shows 'Failed' label for a failed step | "Failed" text visible when step status is `"failed"` |
| 5 | shows 'View details →' for completed steps | Hint text visible when step status is `"complete"` |
| 6 | shows 'Queued' for ghost steps when run is active | "Queued" labels appear for steps with no data when `runStatus="running"` |
| 7 | does not show 'Queued' when run is not active | "Queued" absent when `runStatus="complete"` |
| 8 | shows error message when step has errorMessage | `step.errorMessage` text rendered in a red error box |

### Step click behavior (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 9 | clicking a completed step opens StepDetailDrawer | Drawer content (`"intake"` agent name) becomes visible after click |
| 10 | pending steps do not have cursor-pointer | Ghost step rows have no clickable class |

### Drawer close (2 tests)

| # | Test | What is asserted |
|---|------|------------------|
| 11 | clicking the close button closes the drawer | Close button click removes `"intake"` text from the visible area |
| 12 | clicking the backdrop closes the drawer | Click on `.fixed.inset-0` backdrop dismisses the drawer |

---

## 10. Coverage Gaps

The following interactive surfaces are not covered by component tests and why:

| Surface | Reason not covered |
|---------|--------------------|
| `AgentOutputCard` expand/collapse | Collapse toggle is tested implicitly by `AgentTimeline`; isolated test adds little value |
| `ApprovalQueueTable` | Renders a table of server-fetched data passed as props; interaction is navigation only — covered by E2E |
| `TicketList` filtering/search | Uses Next.js router `searchParams` for filter state — requires full App Router context |
| `KnowledgeLibrary` | Read-only display component with no interactive elements beyond links |
| `TrainingRevealPanel` | Depends on a real investigation run fetched server-side |
| `ThemeToggle` | Toggles a class on `<html>` — not meaningful in jsdom without a full layout tree |
| Dashboard KPI cards | Pure display components — no interactivity |
| Incident header / timeline | Read-only display; status changes go through the `StatusPageEditor` which is covered |
| Clerk `OrganizationSwitcher` | Third-party Clerk component — not testable in isolation without Clerk's test mode |

---

## 11. Mock Reference

Every UI test file follows the same setup pattern:

```ts
// At the top of each file:
// @vitest-environment jsdom

// next/navigation (components that navigate or refresh)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/",
}));

// fetch (all API calls)
vi.stubGlobal("fetch", vi.fn());

// window.confirm (DemoReset only)
vi.stubGlobal("confirm", vi.fn());

// Cleanup in afterEach
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
```

RTL's `cleanup()` is called automatically after each test because `globals: true` is set in `vitest.config.ts`, which lets RTL detect and register the `afterEach` hook.
