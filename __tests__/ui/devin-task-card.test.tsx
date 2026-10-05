// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevinTaskCard, type SerializedDevinTask } from "@/components/devin/devin-task-card";

function makeTask(overrides?: Partial<SerializedDevinTask>): SerializedDevinTask {
  return {
    id: "task-1",
    mode: "reproduce",
    status: "working",
    verdict: null,
    verdictReason: null,
    pullRequestUrl: null,
    repository: "https://github.com/org/repo",
    devinSessionId: "session-1",
    sessionUrl: "https://app.devin.ai/sessions/session-1",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DevinTaskCard", () => {
  it("renders working status with animated indicator", () => {
    const { container } = render(<DevinTaskCard task={makeTask({ status: "working" })} />);
    // Status appears on the card badge and in the (default-open) chat header
    expect(screen.getAllByText("working").length).toBeGreaterThan(0);
    // Animated pulse indicator is present somewhere in the card
    const pulseEl = container.querySelector(".animate-pulse");
    expect(pulseEl).not.toBeNull();
  });

  it("renders PR link only when pullRequestUrl present", () => {
    const { rerender } = render(<DevinTaskCard task={makeTask()} />);
    expect(screen.queryByText("Pull Request")).toBeNull();

    rerender(<DevinTaskCard task={makeTask({ pullRequestUrl: "https://github.com/org/repo/pull/42" })} />);
    expect(screen.getByText("Pull Request")).toBeDefined();
  });

  it("renders verdict badge with correct content", () => {
    render(<DevinTaskCard task={makeTask({ verdict: "REPRODUCED", status: "finished" })} />);
    expect(screen.getByText("REPRODUCED")).toBeDefined();
  });

  it("shows cancel button for non-terminal status", () => {
    render(<DevinTaskCard task={makeTask({ status: "working" })} />);
    expect(screen.getByRole("button", { name: "Cancel Devin task" })).toBeDefined();
  });

  it("hides cancel button for terminal status", () => {
    render(<DevinTaskCard task={makeTask({ status: "finished" })} />);
    expect(screen.queryByRole("button", { name: "Cancel Devin task" })).toBeNull();
  });

  it("opens the chat by default", () => {
    render(<DevinTaskCard task={makeTask({ status: "working" })} />);
    expect(screen.getByText("Devin Conversation")).toBeDefined();
    expect(screen.getByText("Hide chat")).toBeDefined();
  });

  it("shows Devin is working while the session is active", () => {
    render(<DevinTaskCard task={makeTask({ status: "working" })} />);
    expect(screen.getByText("Devin is working")).toBeDefined();
  });

  it("shows waiting for reply when Devin is blocked", () => {
    render(<DevinTaskCard task={makeTask({ status: "blocked" })} />);
    expect(screen.getByText("Devin is waiting for your reply")).toBeDefined();
  });

  it("shows no working indicator for finished sessions", () => {
    render(<DevinTaskCard task={makeTask({ status: "finished" })} />);
    expect(screen.queryByText("Devin is working")).toBeNull();
  });

  it("shows mode badge", () => {
    render(<DevinTaskCard task={makeTask({ mode: "fix" })} />);
    expect(screen.getByText("Fix")).toBeDefined();
  });
});
