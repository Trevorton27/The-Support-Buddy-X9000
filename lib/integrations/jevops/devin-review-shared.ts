// Client-safe types and pure helpers for JevOps reviews of Devin output.
// Server-side evaluation lives in ./devin-review.ts.

export const MAX_JEV_FEEDBACK_ROUNDS = 2;

export type Disposition = "allow" | "retry" | "human_review" | "block";

export interface DevinJevJudgment {
  question_key: string;
  question_type: string;
  value: number | string;
  confidence: number | null;
}

export interface DevinJevReview {
  decisionId: string;
  round: number;
  jevDisposition: string; // what JevOps returned
  disposition: string; // after local policy overrides
  overrides: string[]; // why the local policy escalated, if it did
  judgments: DevinJevJudgment[];
  matchedRule: string | null;
  providerError: string | null;
  evaluatedAt: string;
  outcome?: { merged: boolean; prNumber: number; recordedAt: string };
}

export interface DevinFixEvidence {
  changedFiles?: string[];
  testResults?: string;
  residualRisks?: string[];
}

const RANK: Record<string, number> = { allow: 0, retry: 1, human_review: 2, block: 3 };

// Paths where an untested change should never be merged on an AI's say-so
const SENSITIVE_PATH = /(^|\/)(auth|billing|payments?|migrations?|secrets?|security|infra|terraform)(\/|\.|$)|(^|\/)\.github\/workflows\//i;

function escalate(current: string, to: Disposition): string {
  return (RANK[to] ?? 0) > (RANK[current] ?? 0) ? to : current;
}

/** Deterministic rules layered on top of Jev's disposition. They can only make it stricter. */
export function applyLocalPolicy(
  jevDisposition: string,
  evidence: DevinFixEvidence
): { disposition: string; overrides: string[] } {
  let disposition = jevDisposition;
  const overrides: string[] = [];

  const sensitive = (evidence.changedFiles ?? []).filter((f) => SENSITIVE_PATH.test(f));
  const hasTests = !!evidence.testResults?.trim();
  if (sensitive.length > 0 && !hasTests) {
    disposition = escalate(disposition, "block");
    overrides.push(`Touches sensitive paths without test evidence: ${sensitive.join(", ")}`);
  }

  const risks = evidence.residualRisks ?? [];
  if (risks.length > 0) {
    const next = escalate(disposition, "human_review");
    if (next !== disposition) overrides.push(`Devin reported ${risks.length} residual risk${risks.length === 1 ? "" : "s"}`);
    disposition = next;
  }

  return { disposition, overrides };
}

export const JUDGMENT_LABELS: Record<string, string> = {
  action_appropriate: "Fixes root cause",
  tests_credible: "Tests credible",
  risk_level: "Merge risk",
  recommended_route: "Recommended",
};

/** Judgments that argue against merging: low 0–1 scores, high risk, or a non-allow route. */
export function concerningJudgments(review: DevinJevReview): DevinJevJudgment[] {
  return review.judgments.filter((j) => {
    if (j.question_type === "noul") return typeof j.value === "number" && j.value < 0.6;
    if (j.question_type === "score") return typeof j.value === "number" && j.value >= 6;
    if (j.question_type === "choice") return j.value !== "allow";
    return false;
  });
}

function describeJudgment(j: DevinJevJudgment): string {
  const label = JUDGMENT_LABELS[j.question_key] ?? j.question_key;
  if (j.question_type === "noul" && typeof j.value === "number") return `${label}: ${j.value.toFixed(2)} (0–1)`;
  if (j.question_type === "score" && typeof j.value === "number") return `${label}: ${j.value.toFixed(1)}/10`;
  return `${label}: ${String(j.value).replace(/_/g, " ")}`;
}

/** Message posted into the Devin session when a reviewer sends the PR back. */
export function buildDevinFeedbackMessage(review: DevinJevReview, note?: string): string {
  const concerns = [
    ...review.overrides.map((o) => `- Policy: ${o}`),
    ...concerningJudgments(review).map((j) => `- ${describeJudgment(j)}`),
  ];

  return [
    `An automated review (JevOps, Jev model) of your pull request recommends: ${review.disposition.replace(/_/g, " ").toUpperCase()}.`,
    "",
    concerns.length > 0 ? "Concerns:" : "No specific judgment fell below threshold, but the PR was not cleared to merge.",
    ...concerns,
    ...(note?.trim() ? ["", `Reviewer note: ${note.trim()}`] : []),
    "",
    "Please address these on the same branch, run the relevant tests, and update your structured output (changedFiles, testResults, residualRisks) when done.",
  ].join("\n");
}
