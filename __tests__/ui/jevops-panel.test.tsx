// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JevOpsPanel } from "@/components/agents/jevops-panel";
import type { JevOpsDecision } from "@/lib/integrations/jevops/client";

function makeDecision(overrides?: Partial<JevOpsDecision>): JevOpsDecision {
  return {
    id: "dec-1",
    disposition: "allow",
    final_disposition: null,
    action_type: "send_customer_reply",
    judgments: [{ question_key: "risk_level", question_type: "score", value: 2.5, probabilities: null, confidence: 0.8 }],
    policy_trace: { matched_rule: "low_risk" },
    provider_latency_ms: 420,
    provider_model: "jev-latest",
    correlation_id: "run-1",
    ...overrides,
  };
}

describe("JevOpsPanel", () => {
  it("shows 'My Name Jev' in green when Jev ran successfully", () => {
    render(<JevOpsPanel enabled decisionId="dec-1" decision={makeDecision()} />);
    expect(screen.getByText(/Typesafe AI response:/)).toBeDefined();
    const status = screen.getByText("My Name Jev");
    expect(status.className).toContain("text-green-600");
    expect(screen.queryByText("Jev Failed To Run")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the HTTP error code and message when the evaluate call failed", () => {
    render(<JevOpsPanel enabled decision={null} error={{ code: "500", message: "Internal Server Error" }} />);
    const status = screen.getByText("Jev Failed To Run");
    expect(status.className).toContain("text-red-600");
    expect(screen.getByText("500")).toBeDefined();
    expect(screen.getByText("Internal Server Error")).toBeDefined();
    expect(screen.queryByText("My Name Jev")).toBeNull();
  });

  it("treats a provider fallback decision as a failure and still shows the fallback", () => {
    render(
      <JevOpsPanel
        enabled
        decisionId="dec-2"
        decision={makeDecision({
          disposition: "human_review",
          provider_model: "failed",
          policy_trace: { error: "Provider unavailable: No API key was provided.", fallback: "human_review" },
        })}
      />
    );
    expect(screen.getByText("Jev Failed To Run")).toBeDefined();
    expect(screen.getByText("JEV_PROVIDER_ERROR")).toBeDefined();
    expect(screen.getByText(/No API key was provided/)).toBeDefined();
    expect(screen.getByText(/fell back to human review/)).toBeDefined();
  });

  it("reports NOT_CONFIGURED when JevOps is disabled", () => {
    render(<JevOpsPanel enabled={false} decision={null} />);
    expect(screen.getByText("Jev Failed To Run")).toBeDefined();
    expect(screen.getByText("NOT_CONFIGURED")).toBeDefined();
    expect(screen.getByText("Settings →")).toBeDefined();
  });

  it("asks the user to reload when a saved decision couldn't be loaded", () => {
    render(<JevOpsPanel enabled decisionId="dec-1" decision={null} error={{ code: "TIMEOUT", message: "timed out" }} />);
    expect(screen.getByText("TIMEOUT")).toBeDefined();
    expect(screen.getByText(/Please reload the page to try again/)).toBeDefined();
  });

  it("does not suggest reloading when the evaluation itself failed", () => {
    render(<JevOpsPanel enabled decision={null} error={{ code: "500", message: "Internal Server Error" }} />);
    expect(screen.queryByText(/reload the page/)).toBeNull();
  });

  it("reports NO_DECISION for runs with no recorded decision or error", () => {
    render(<JevOpsPanel enabled decision={null} />);
    expect(screen.getByText("NO_DECISION")).toBeDefined();
  });
});
