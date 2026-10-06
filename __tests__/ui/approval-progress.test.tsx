// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ApprovalProgressTracker } from "@/components/approvals/approval-progress";
import { DecisionBanner } from "@/components/approvals/decision-banner";
import type { ApprovalProgress } from "@/lib/approval-progress";

const processing: ApprovalProgress = {
  decision: "approved",
  active: true,
  stages: [
    { key: "decision", label: "Approved by you", state: "done" },
    { key: "processing", label: "Processing approval…", state: "active" },
  ],
};
const processed: ApprovalProgress = {
  decision: "approved",
  active: false,
  stages: [
    { key: "decision", label: "Approved by you", state: "done" },
    { key: "processing", label: "Approval processed", state: "done" },
    { key: "fix", label: "Fix with Devin", state: "action", href: "#devin", hrefLabel: "Go to Devin AI" },
  ],
};

describe("ApprovalProgressTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders each stage and the next action link", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ApprovalProgressTracker runId="run-1" initial={processed} />);
    expect(screen.getByText("What happens next")).toBeDefined();
    expect(screen.getByText("Approval processed")).toBeDefined();
    expect(screen.getByText("Go to Devin AI").closest("a")?.getAttribute("href")).toBe("#devin");
  });

  it("polls while a stage is active and stops once nothing is moving", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ progress: processed }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalProgressTracker runId="run-1" initial={processing} />);
    expect(screen.getByText("Live")).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/investigations/run-1/progress", { cache: "no-store" });
    expect(screen.getByText("Approval processed")).toBeDefined();
    expect(screen.queryByText("Live")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not poll when nothing is active", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalProgressTracker runId="run-1" initial={processed} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("DecisionBanner", () => {
  it("confirms the decision on the item, with next/back links", () => {
    render(<DecisionBanner decision="approved" nextRunId="run-2" />);
    expect(screen.getByText(/You approved this reply/)).toBeDefined();
    expect(screen.getByText("Next in queue").closest("a")?.getAttribute("href")).toBe("/approvals/run-2");
    expect(screen.getByText("Back to queue").closest("a")?.getAttribute("href")).toBe("/approvals");
  });

  it("links back to the decided item when shown on the next approval", () => {
    render(<DecisionBanner decision="rejected" subject="Checkout 500s" viewHref="/investigations/run-1" />);
    expect(screen.getByText(/You rejected/)).toBeDefined();
    expect(screen.getByText("Checkout 500s")).toBeDefined();
    expect(screen.getByText("View it").closest("a")?.getAttribute("href")).toBe("/investigations/run-1");
    expect(screen.queryByText("Back to queue")).toBeNull();
  });
});
