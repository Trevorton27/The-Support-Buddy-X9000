import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import type { Hypothesis } from "@/agents/state";
import type { ParsedDevinResult } from "@/lib/integrations/devin/result-parser";
import { evaluateAction, isJevOpsEnabled, recordOutcome, type JevOpsQuestion } from "./client";
import { applyLocalPolicy, type DevinJevReview } from "./devin-review-shared";

const logger = createLogger("jevops-devin-review");

const MERGE_QUESTIONS: Record<string, JevOpsQuestion> = {
  action_appropriate: {
    type: "noul",
    instructions: "Does this pull request fix the confirmed root cause of the ticket without unrelated changes?",
  },
  tests_credible: {
    type: "noul",
    instructions: "Do the reported test results credibly show the fix works and nothing regressed?",
  },
  risk_level: {
    type: "score",
    instructions: "Rate the risk of merging this change from 1 (minimal) to 10 (critical).",
    criteria: [
      "blast radius of the changed files",
      "reversibility",
      "sensitivity of the code (auth, billing, data)",
      "strength of the test evidence",
    ],
  },
  recommended_route: {
    type: "choice",
    instructions: "What should happen to this pull request?",
    criteria: {
      allow: "Ready to merge",
      retry: "Send back to Devin with specific changes",
      human_review: "An engineer must review before merging",
      block: "Do not merge",
    },
  },
};

/**
 * Ask JevOps whether Devin's fix PR is ready to merge, layer local policy on top, and store the
 * result on the DevinTask. Safe to call more than once per round: the idempotency key makes
 * JevOps return the same decision. Returns null when there is nothing to review or JevOps is off.
 */
export async function evaluateDevinOutput(taskId: string): Promise<DevinJevReview | null> {
  if (!isJevOpsEnabled()) return null;

  const task = await prisma.devinTask.findUnique({
    where: { id: taskId },
    include: {
      ticket: { select: { title: true, severity: true } },
      investigationRun: { select: { hypotheses: true } },
    },
  });
  if (!task || task.mode !== "fix" || !task.pullRequestUrl || task.status === "cancelled") return null;

  const result = (task.structuredResult ?? {}) as Partial<ParsedDevinResult>;
  const topHypothesis = ((task.investigationRun?.hypotheses as unknown as Hypothesis[] | null) ?? [])[0];

  const decision = await evaluateAction({
    agentId: process.env.JEVOPS_AGENT_ID || "30000000-0000-0000-0000-000000000002",
    actionType: "merge_devin_fix",
    action: {
      pull_request_url: task.pullRequestUrl,
      branch: result.branch ?? task.branch,
      changed_files: result.changedFiles ?? [],
      verdict: task.verdict,
      verdict_reason: task.verdictReason,
    },
    objective: `Merge Devin's fix for support ticket: ${task.ticket?.title ?? "unknown"}`,
    state: {
      devin_task_id: task.id,
      feedback_round: task.jevopsReviewRound,
      ticket_severity: task.ticket?.severity ?? "unknown",
      investigation_root_cause: topHypothesis
        ? { title: topHypothesis.title, confidence: topHypothesis.confidence }
        : null,
    },
    evidence: {
      test_results: result.testResults ?? null,
      residual_risks: result.residualRisks ?? [],
      confirmed_hypotheses: result.confirmedHypotheses ?? [],
      rejected_hypotheses: result.rejectedHypotheses ?? [],
      blockers: result.blockers ?? [],
    },
    questions: MERGE_QUESTIONS,
    correlationId: task.investigationRunId ?? task.id,
    idempotencyKey: `devin-${task.id}-r${task.jevopsReviewRound}`,
  });
  if (!decision) return null;

  const { disposition, overrides } = applyLocalPolicy(decision.disposition, {
    changedFiles: result.changedFiles,
    testResults: result.testResults,
    residualRisks: result.residualRisks,
  });

  const review: DevinJevReview = {
    decisionId: decision.id,
    round: task.jevopsReviewRound,
    jevDisposition: decision.disposition,
    disposition,
    overrides,
    judgments: decision.judgments.map((j) => ({
      question_key: j.question_key,
      question_type: j.question_type,
      value: j.value,
      confidence: j.confidence,
    })),
    matchedRule: (decision.policy_trace?.matched_rule as string | undefined) ?? null,
    providerError: (decision.policy_trace?.error as string | undefined) ?? null,
    evaluatedAt: new Date().toISOString(),
  };

  await prisma.devinTask.update({
    where: { id: task.id },
    data: { jevopsDecisionId: decision.id, jevopsReview: JSON.parse(JSON.stringify(review)) },
  });

  logger.info("Devin output reviewed by JevOps", {
    taskId: task.id,
    round: review.round,
    jevDisposition: review.jevDisposition,
    disposition,
    overrides: overrides.length,
  });
  return review;
}

/**
 * Record the real-world outcome of a reviewed Devin PR (merged = allow, closed unmerged = block)
 * so JevOps can calibrate its judgments of Devin's work.
 */
export async function recordDevinPrOutcome(prUrl: string, merged: boolean, prNumber: number): Promise<boolean> {
  const task = await prisma.devinTask.findFirst({
    where: { pullRequestUrl: prUrl, jevopsDecisionId: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!task?.jevopsDecisionId) return false;

  const review = task.jevopsReview as unknown as DevinJevReview | null;
  await recordOutcome(task.jevopsDecisionId, merged ? "allow" : "block", {
    source: "github",
    pr_number: prNumber,
    merged,
    review_disposition: review?.disposition ?? null,
    feedback_rounds: task.jevopsReviewRound,
  });

  if (review) {
    await prisma.devinTask.update({
      where: { id: task.id },
      data: {
        jevopsReview: JSON.parse(
          JSON.stringify({ ...review, outcome: { merged, prNumber, recordedAt: new Date().toISOString() } })
        ),
      },
    });
  }

  logger.info("Devin PR outcome recorded in JevOps", { taskId: task.id, merged, prNumber });
  return true;
}
