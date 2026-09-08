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
    expect(screen.getByText("working")).toBeDefined();
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
    // Should have cancel (X icon) button - look for the button with red text
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("hides cancel button for terminal status", () => {
    render(<DevinTaskCard task={makeTask({ status: "finished" })} />);
    // No cancel or send buttons for terminal statuses
    const buttons = screen.queryAllByRole("button");
    // Only the "Show reason" button might exist, not action buttons
    const actionButtons = buttons.filter(
      (b) => !b.textContent?.includes("reason")
    );
    expect(actionButtons.length).toBe(0);
  });

  it("shows mode badge", () => {
    render(<DevinTaskCard task={makeTask({ mode: "fix" })} />);
    expect(screen.getByText("Fix")).toBeDefined();
  });
});
