import { describe, it, expect } from "vitest";
import { buildApprovalProgress, type ApprovalProgressInput } from "@/lib/approval-progress";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function input(overrides?: Partial<ApprovalProgressInput>): ApprovalProgressInput {
  return {
    approvalStatus: "approved",
    status: "complete",
    approvedAt: minutesAgo(1),
    approverName: "Alex",
    approverIsViewer: true,
    reviewerNote: null,
    ticketId: "ticket-1",
    jevopsEnabled: true,
    fixTask: null,
    now: NOW,
    ...overrides,
  };
}

function fixTask(overrides?: Partial<NonNullable<ApprovalProgressInput["fixTask"]>>) {
  return {
    status: "working",
    pullRequestUrl: null,
    jevopsReview: null,
    jevopsReviewRound: 0,
    startedAt: minutesAgo(10),
    completedAt: null,
    ...overrides,
  };
}

const states = (p: ReturnType<typeof buildApprovalProgress>) =>
  Object.fromEntries((p?.stages ?? []).map((s) => [s.key, s.state]));
const stage = (p: ReturnType<typeof buildApprovalProgress>, key: string) => p?.stages.find((s) => s.key === key);

describe("buildApprovalProgress", () => {
  it("returns null until a human decides", () => {
    expect(buildApprovalProgress(input({ approvalStatus: "pending" }))).toBeNull();
    expect(buildApprovalProgress(input({ approvalStatus: null }))).toBeNull();
  });

  it("says who approved: you vs. a named teammate", () => {
    expect(stage(buildApprovalProgress(input()), "decision")?.label).toBe("Approved by you");
    expect(stage(buildApprovalProgress(input({ approverIsViewer: false })), "decision")?.label).toBe("Approved by Alex");
  });

  it("shows processing as active (and polls) until Inngest completes the run", () => {
    const p = buildApprovalProgress(input({ status: "awaiting_approval" }));
    expect(stage(p, "processing")).toMatchObject({ label: "Processing approval…", state: "active" });
    expect(p?.active).toBe(true);
  });

  it("warns when processing is taking longer than usual", () => {
    const p = buildApprovalProgress(input({ status: "awaiting_approval", approvedAt: minutesAgo(5) }));
    expect(stage(p, "processing")?.detail).toMatch(/longer than usual/);
  });

  it("offers Fix with Devin as the next action once processed, and stops polling", () => {
    const p = buildApprovalProgress(input());
    expect(states(p)).toEqual({
      decision: "done",
      processing: "done",
      fix: "action",
      devin: "pending",
      pr: "pending",
      jev: "pending",
      merge: "pending",
    });
    expect(stage(p, "fix")?.href).toBe("#devin");
    expect(p?.active).toBe(false);
  });

  it("tracks Devin working → PR → Jev review → merge", () => {
    expect(states(buildApprovalProgress(input({ fixTask: fixTask() })))).toMatchObject({
      fix: "done", devin: "active", pr: "pending",
    });

    const reviewing = buildApprovalProgress(input({
      fixTask: fixTask({ status: "finished", pullRequestUrl: "https://github.com/o/r/pull/9", completedAt: minutesAgo(1) }),
    }));
    expect(states(reviewing)).toMatchObject({ devin: "done", pr: "done", jev: "active", merge: "pending" });
    expect(stage(reviewing, "pr")?.href).toBe("https://github.com/o/r/pull/9");

    const merged = buildApprovalProgress(input({
      fixTask: fixTask({
        status: "finished",
        pullRequestUrl: "https://github.com/o/r/pull/9",
        jevopsReview: {
          decisionId: "d", round: 0, jevDisposition: "allow", disposition: "allow", overrides: [], judgments: [],
          matchedRule: null, providerError: null, evaluatedAt: minutesAgo(1),
          outcome: { merged: true, prNumber: 9, recordedAt: minutesAgo(0) },
        },
      }),
    }));
    expect(states(merged)).toMatchObject({ jev: "done", merge: "done" });
    expect(stage(merged, "jev")?.label).toBe("Jev review: ready to merge");
    expect(stage(merged, "merge")?.label).toBe("PR #9 merged");
    expect(merged?.active).toBe(false);
  });

  it("flags a Devin session waiting on a reply as an action, not progress", () => {
    const p = buildApprovalProgress(input({ fixTask: fixTask({ status: "blocked" }) }));
    expect(stage(p, "devin")).toMatchObject({ state: "action", label: "Devin is waiting for a reply" });
  });

  it("stops waiting for a Jev review that never arrived", () => {
    const p = buildApprovalProgress(input({
      fixTask: fixTask({ status: "finished", pullRequestUrl: "https://x/pull/1", completedAt: minutesAgo(10) }),
    }));
    expect(stage(p, "jev")).toMatchObject({ state: "skipped", label: "Jev review unavailable" });
    expect(p?.active).toBe(false);
  });

  it("marks the review as an action when Jev did not clear the PR, and as active during a re-review", () => {
    const review = {
      decisionId: "d", round: 0, jevDisposition: "retry", disposition: "retry", overrides: [], judgments: [],
      matchedRule: null, providerError: null, evaluatedAt: minutesAgo(1),
    };
    const pr = { status: "finished", pullRequestUrl: "https://x/pull/1", jevopsReview: review };
    expect(stage(buildApprovalProgress(input({ fixTask: fixTask(pr) })), "jev")?.state).toBe("action");
    expect(stage(buildApprovalProgress(input({ fixTask: fixTask({ ...pr, jevopsReviewRound: 1 }) })), "jev")?.state).toBe("active");
  });

  it("skips later stages when Devin fails without a PR", () => {
    expect(states(buildApprovalProgress(input({ fixTask: fixTask({ status: "failed" }) })))).toMatchObject({
      devin: "failed", pr: "skipped", jev: "skipped", merge: "skipped",
    });
  });

  it("offers a re-run after a rejection, with the reviewer's note", () => {
    const p = buildApprovalProgress(input({ approvalStatus: "rejected", reviewerNote: "Wrong root cause" }));
    expect(stage(p, "decision")).toMatchObject({ label: "Rejected by you", state: "failed", detail: "Note: Wrong root cause" });
    expect(stage(p, "rerun")).toMatchObject({ state: "action", href: "/tickets/ticket-1" });
    expect(stage(p, "fix")).toBeUndefined();
  });

  it("explains approval timeouts", () => {
    const p = buildApprovalProgress(input({ approvalStatus: "timeout" }));
    expect(stage(p, "decision")?.label).toBe("Approval timed out");
    expect(p?.decision).toBe("timeout");
  });
});
