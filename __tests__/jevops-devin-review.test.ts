import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyLocalPolicy,
  buildDevinFeedbackMessage,
  concerningJudgments,
  type DevinJevReview,
} from "@/lib/integrations/jevops/devin-review-shared";

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockEvaluate = vi.fn();
const mockRecordOutcome = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    devinTask: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/integrations/jevops/client", () => ({
  isJevOpsEnabled: () => true,
  evaluateAction: (...args: unknown[]) => mockEvaluate(...args),
  recordOutcome: (...args: unknown[]) => mockRecordOutcome(...args),
}));

const { evaluateDevinOutput, recordDevinPrOutcome } = await import("@/lib/integrations/jevops/devin-review");

function makeReview(overrides?: Partial<DevinJevReview>): DevinJevReview {
  return {
    decisionId: "dec-1",
    round: 0,
    jevDisposition: "retry",
    disposition: "retry",
    overrides: [],
    judgments: [
      { question_key: "action_appropriate", question_type: "noul", value: 0.82, confidence: null },
      { question_key: "tests_credible", question_type: "noul", value: 0.31, confidence: null },
      { question_key: "risk_level", question_type: "score", value: 7, confidence: 0.6 },
      { question_key: "recommended_route", question_type: "choice", value: "retry", confidence: 0.7 },
    ],
    matchedRule: null,
    providerError: null,
    evaluatedAt: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides?: Record<string, unknown>) {
  return {
    id: "task-1",
    mode: "fix",
    status: "finished",
    pullRequestUrl: "https://github.com/org/repo/pull/42",
    branch: "devin/fix",
    verdict: "FIX_SUBMITTED",
    verdictReason: "Fixed the pool size",
    investigationRunId: "run-1",
    jevopsReviewRound: 0,
    jevopsDecisionId: null,
    jevopsReview: null,
    structuredResult: {
      changedFiles: ["src/db/pool.ts"],
      testResults: "42 passed",
      residualRisks: [],
    },
    ticket: { title: "Checkout 500s", severity: "high" },
    investigationRun: { hypotheses: [{ title: "Pool exhaustion", confidence: 85 }] },
    ...overrides,
  };
}

function makeDecision(disposition = "allow") {
  return {
    id: "dec-1",
    disposition,
    judgments: [{ question_key: "risk_level", question_type: "score", value: 3, probabilities: null, confidence: 0.8 }],
    policy_trace: {},
  };
}

describe("applyLocalPolicy", () => {
  it("keeps Jev's disposition when nothing is flagged", () => {
    expect(applyLocalPolicy("allow", { changedFiles: ["src/a.ts"], testResults: "ok" })).toEqual({
      disposition: "allow",
      overrides: [],
    });
  });

  it("blocks untested changes to sensitive paths", () => {
    const result = applyLocalPolicy("allow", { changedFiles: ["src/auth/session.ts", "README.md"] });
    expect(result.disposition).toBe("block");
    expect(result.overrides[0]).toContain("src/auth/session.ts");
  });

  it("does not block sensitive paths that have test evidence", () => {
    expect(applyLocalPolicy("allow", { changedFiles: ["db/migrations/001.sql"], testResults: "12 passed" }).disposition).toBe("allow");
  });

  it("escalates residual risks to human review but never loosens", () => {
    expect(applyLocalPolicy("allow", { residualRisks: ["cache not warmed"] }).disposition).toBe("human_review");
    expect(applyLocalPolicy("block", { residualRisks: ["x"] })).toEqual({ disposition: "block", overrides: [] });
  });
});

describe("feedback helpers", () => {
  it("flags low scores, high risk and a non-allow route", () => {
    expect(concerningJudgments(makeReview()).map((j) => j.question_key)).toEqual([
      "tests_credible",
      "risk_level",
      "recommended_route",
    ]);
  });

  it("builds a Devin message with concerns, overrides and the reviewer note", () => {
    const msg = buildDevinFeedbackMessage(makeReview({ overrides: ["Touches sensitive paths"] }), "  check the retry path ");
    expect(msg).toContain("recommends: RETRY");
    expect(msg).toContain("- Policy: Touches sensitive paths");
    expect(msg).toContain("- Tests credible: 0.31 (0–1)");
    expect(msg).toContain("- Merge risk: 7.0/10");
    expect(msg).toContain("Reviewer note: check the retry path");
    expect(msg).not.toContain("Fixes root cause");
  });
});

describe("evaluateDevinOutput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evaluates a fix PR as merge_devin_fix and stores the review", async () => {
    mockFindUnique.mockResolvedValue(makeTask());
    mockEvaluate.mockResolvedValue(makeDecision("allow"));

    const review = await evaluateDevinOutput("task-1");

    const params = mockEvaluate.mock.calls[0][0];
    expect(params.actionType).toBe("merge_devin_fix");
    expect(params.idempotencyKey).toBe("devin-task-1-r0");
    expect(Object.keys(params.questions)).toEqual(["action_appropriate", "tests_credible", "risk_level", "recommended_route"]);
    expect(params.action.changed_files).toEqual(["src/db/pool.ts"]);
    expect(review?.disposition).toBe("allow");
    expect(mockUpdate.mock.calls[0][0].data.jevopsDecisionId).toBe("dec-1");
  });

  it("applies the local policy on top of Jev's answer", async () => {
    mockFindUnique.mockResolvedValue(makeTask({ structuredResult: { changedFiles: ["billing/charge.ts"] } }));
    mockEvaluate.mockResolvedValue(makeDecision("allow"));

    const review = await evaluateDevinOutput("task-1");
    expect(review?.jevDisposition).toBe("allow");
    expect(review?.disposition).toBe("block");
  });

  it("uses a new idempotency key per feedback round", async () => {
    mockFindUnique.mockResolvedValue(makeTask({ jevopsReviewRound: 1 }));
    mockEvaluate.mockResolvedValue(makeDecision());
    await evaluateDevinOutput("task-1");
    expect(mockEvaluate.mock.calls[0][0].idempotencyKey).toBe("devin-task-1-r1");
  });

  it("skips reproduce tasks and fixes without a PR", async () => {
    mockFindUnique.mockResolvedValueOnce(makeTask({ mode: "reproduce" }));
    expect(await evaluateDevinOutput("task-1")).toBeNull();
    mockFindUnique.mockResolvedValueOnce(makeTask({ pullRequestUrl: null }));
    expect(await evaluateDevinOutput("task-1")).toBeNull();
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  it("stores nothing when JevOps returns no decision", async () => {
    mockFindUnique.mockResolvedValue(makeTask());
    mockEvaluate.mockResolvedValue(null);
    expect(await evaluateDevinOutput("task-1")).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("recordDevinPrOutcome", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.clearAllMocks());

  it("records merged PRs as allow and closed PRs as block", async () => {
    mockFindFirst.mockResolvedValue(makeTask({ jevopsDecisionId: "dec-1", jevopsReview: makeReview() }));

    expect(await recordDevinPrOutcome("https://github.com/org/repo/pull/42", true, 42)).toBe(true);
    expect(mockRecordOutcome.mock.calls[0][0]).toBe("dec-1");
    expect(mockRecordOutcome.mock.calls[0][1]).toBe("allow");
    expect(mockUpdate.mock.calls[0][0].data.jevopsReview.outcome).toMatchObject({ merged: true, prNumber: 42 });

    await recordDevinPrOutcome("https://github.com/org/repo/pull/42", false, 42);
    expect(mockRecordOutcome.mock.calls[1][1]).toBe("block");
  });

  it("does nothing for PRs without a JevOps review", async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await recordDevinPrOutcome("https://github.com/org/repo/pull/7", true, 7)).toBe(false);
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });
});
