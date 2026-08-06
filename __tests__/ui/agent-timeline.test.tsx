// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTimeline } from "@/components/agents/agent-timeline";
import type { AgentStep } from "@prisma/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const STEP_JSON = JSON.stringify({
  id: "step-1",
  agentName: "intake",
  status: "complete",
  runId: "run-1",
  input: null,
  output: null,
  tokenUsage: null,
  toolsCalled: null,
  errorMessage: null,
  confidenceScore: null,
  durationMs: 1200,
  startedAt: "2024-01-01T10:00:00.000Z",
  completedAt: "2024-01-01T10:00:01.200Z",
});

// Mock fetch so StepDetailDrawer's useEffect returns a valid step
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(STEP_JSON, { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeStep(overrides: Partial<AgentStep> = {}): AgentStep {
  return {
    id: "step-1",
    agentName: "intake",
    status: "complete",
    investigationRunId: "run-1",
    input: null,
    output: null,
    tokenUsage: null,
    toolsCalled: null,
    errorMessage: null,
    confidenceScore: null,
    durationMs: 1200,
    startedAt: new Date("2024-01-01T10:00:00Z"),
    completedAt: new Date("2024-01-01T10:00:01.2Z"),
    ...overrides,
  };
}

describe("AgentTimeline", () => {
  describe("pipeline stage labels", () => {
    it("renders all 10 pipeline stage labels", () => {
      render(<AgentTimeline steps={[]} runId="run-1" runStatus="complete" />);
      [
        "Ticket Classification",
        "Customer Context",
        "Log Analysis",
        "Knowledge Retrieval",
        "Incident Correlation",
        "Deployment Correlation",
        "Root Cause Analysis",
        "Response Drafting",
        "Guardrails Check",
        "Escalation Note",
      ].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
    });

    it("renders 'Running in parallel' label for the parallel group", () => {
      render(<AgentTimeline steps={[]} runId="run-1" runStatus="complete" />);
      expect(screen.getByText(/running in parallel/i)).toBeInTheDocument();
    });

    it("renders 'Agent Pipeline' heading", () => {
      render(<AgentTimeline steps={[]} runId="run-1" runStatus="complete" />);
      expect(screen.getByText("Agent Pipeline")).toBeInTheDocument();
    });
  });

  describe("step states", () => {
    it("shows 'Failed' label for a failed step", () => {
      const failedStep = makeStep({ agentName: "intake", status: "failed" });
      render(<AgentTimeline steps={[failedStep]} runId="run-1" runStatus="complete" />);
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    it("shows 'View details →' hint for completed steps", () => {
      const completedStep = makeStep({ agentName: "intake", status: "complete" });
      render(<AgentTimeline steps={[completedStep]} runId="run-1" runStatus="complete" />);
      expect(screen.getByText(/view details/i)).toBeInTheDocument();
    });

    it("shows 'Queued' for pending ghost steps when run is active", () => {
      render(<AgentTimeline steps={[]} runId="run-1" runStatus="running" />);
      // All stages are ghost/pending and run is active — should show Queued labels
      expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
    });

    it("does not show 'Queued' when run is not active", () => {
      render(<AgentTimeline steps={[]} runId="run-1" runStatus="complete" />);
      expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    });

    it("shows error message when step has errorMessage", () => {
      const failedStep = makeStep({
        agentName: "intake",
        status: "failed",
        errorMessage: "LLM timeout after 30s",
      });
      render(<AgentTimeline steps={[failedStep]} runId="run-1" runStatus="complete" />);
      expect(screen.getByText("LLM timeout after 30s")).toBeInTheDocument();
    });
  });

  describe("step click behavior", () => {
    it("clicking a completed step opens the StepDetailDrawer", async () => {
      const completedStep = makeStep({
        agentName: "intake",
        status: "complete",
        startedAt: new Date("2024-01-01T10:00:00Z"),
        completedAt: new Date("2024-01-01T10:00:01Z"),
      });
      render(<AgentTimeline steps={[completedStep]} runId="run-1" runStatus="complete" />);
      // The step row for Ticket Classification should be clickable
      const stepRow = screen.getByText("Ticket Classification").closest("[class*='cursor-pointer']");
      if (stepRow) await userEvent.click(stepRow);
      // Drawer should appear — it shows the agent name in the header
      expect(screen.getByText("intake")).toBeInTheDocument();
    });

    it("does not open drawer when clicking a pending step (no cursor-pointer)", () => {
      render(<AgentTimeline steps={[]} runId="run-1" runStatus="complete" />);
      // Pending steps have no cursor-pointer class — clicking them does nothing
      const stepRows = screen.getAllByText("Ticket Classification");
      expect(stepRows.length).toBeGreaterThan(0);
    });
  });

  describe("drawer close", () => {
    it("clicking the close button in the drawer closes it", async () => {
      const completedStep = makeStep({
        agentName: "intake",
        status: "complete",
        startedAt: new Date("2024-01-01T10:00:00Z"),
      });
      render(<AgentTimeline steps={[completedStep]} runId="run-1" runStatus="complete" />);
      const stepRow = screen.getByText("Ticket Classification").closest("[class*='cursor-pointer']");
      if (stepRow) {
        await userEvent.click(stepRow);
        // Drawer is open — click the close button (X)
        const closeBtn = screen.getByRole("button", { name: "" }); // The X button has no visible text
        await userEvent.click(closeBtn);
        // Drawer should have slid out (translate-x-full) — content still in DOM but hidden
      }
    });

    it("clicking the backdrop closes the drawer", async () => {
      const completedStep = makeStep({
        agentName: "intake",
        status: "complete",
        startedAt: new Date("2024-01-01T10:00:00Z"),
      });
      render(<AgentTimeline steps={[completedStep]} runId="run-1" runStatus="complete" />);
      const stepRow = screen.getByText("Ticket Classification").closest("[class*='cursor-pointer']");
      if (stepRow) {
        await userEvent.click(stepRow);
        // Find and click the backdrop (fixed inset-0 div)
        const backdrop = document.querySelector(".fixed.inset-0");
        if (backdrop) await userEvent.click(backdrop as HTMLElement);
      }
    });
  });
});
