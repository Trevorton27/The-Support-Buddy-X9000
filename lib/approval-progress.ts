// What happens to an investigation after a human decides on it — pure stage logic shared by the
// investigation page (initial render) and GET /api/investigations/[runId]/progress (live updates).

import type { DevinJevReview } from "@/lib/integrations/jevops/devin-review-shared";

export type StageState = "done" | "active" | "action" | "pending" | "failed" | "skipped";

export interface ProgressStage {
  key: string;
  label: string;
  state: StageState;
  detail?: string;
  at?: string; // ISO timestamp
  href?: string;
  hrefLabel?: string;
}

export interface ApprovalProgress {
  decision: "approved" | "rejected" | "timeout";
  stages: ProgressStage[];
  /** True while something is still moving on its own; the UI polls only while this is set. */
  active: boolean;
}

export interface ApprovalProgressInput {
  approvalStatus: string | null;
  status: string;
  approvedAt: string | null;
  approverName: string | null;
  approverIsViewer: boolean;
  reviewerNote: string | null;
  ticketId: string;
  jevopsEnabled: boolean;
  fixTask: {
    status: string;
    pullRequestUrl: string | null;
    jevopsReview: DevinJevReview | null;
    jevopsReviewRound: number;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  now?: Date;
}

const SLOW_PROCESSING_MS = 2 * 60 * 1000;
// The review runs right after Devin finishes; past this, assume it isn't coming (e.g. JevOps error)
const REVIEW_WAIT_MS = 5 * 60 * 1000;
const DEVIN_STARTING = ["queued", "creating"];
const DEVIN_WAITING = ["blocked", "waiting"];
const DEVIN_FAILED = ["failed", "expired", "cancelled"];

const REVIEW_LABEL: Record<string, string> = {
  allow: "ready to merge",
  retry: "send back to Devin",
  human_review: "needs engineer review",
  block: "do not merge",
};

function actor(input: ApprovalProgressInput): string {
  return input.approverIsViewer ? "you" : input.approverName ?? "a reviewer";
}

function processingStage(input: ApprovalProgressInput): ProgressStage {
  if (input.status === "complete") {
    return {
      key: "processing",
      label: "Approval processed",
      state: "done",
      detail: "Audit logged, Slack notified, work item closed",
    };
  }
  const now = input.now ?? new Date();
  const slow = input.approvedAt && now.getTime() - new Date(input.approvedAt).getTime() > SLOW_PROCESSING_MS;
  return {
    key: "processing",
    label: "Processing approval…",
    state: "active",
    detail: slow
      ? "Taking longer than usual. Your decision is saved; background processing (Inngest) may be delayed."
      : "Logging the audit trail and notifying Slack",
  };
}

function fixStages(input: ApprovalProgressInput): ProgressStage[] {
  const task = input.fixTask;
  const later = (key: string, label: string): ProgressStage => ({ key, label, state: "pending" });

  if (!task) {
    return [
      {
        key: "fix",
        label: "Fix with Devin",
        state: "action",
        detail: "Optional: send the fix to Devin from the Devin AI section below",
        href: "#devin",
        hrefLabel: "Go to Devin AI",
      },
      later("devin", "Devin works on the fix"),
      later("pr", "Pull request opened"),
      later("jev", "Jev reviews the PR"),
      later("merge", "PR merged"),
    ];
  }

  const stages: ProgressStage[] = [
    { key: "fix", label: "Sent to Devin", state: "done", at: task.startedAt ?? undefined },
  ];

  // Devin
  const devinFailed = DEVIN_FAILED.includes(task.status);
  const devinDone = task.status === "finished";
  if (DEVIN_STARTING.includes(task.status)) {
    stages.push({ key: "devin", label: "Devin is starting up", state: "active", href: "#devin", hrefLabel: "Watch" });
  } else if (DEVIN_WAITING.includes(task.status)) {
    stages.push({
      key: "devin",
      label: "Devin is waiting for a reply",
      state: "action",
      detail: "Reply in the Devin chat below",
      href: "#devin",
      hrefLabel: "Open chat",
    });
  } else if (devinFailed) {
    stages.push({ key: "devin", label: `Devin task ${task.status}`, state: "failed" });
  } else if (devinDone) {
    stages.push({ key: "devin", label: "Devin finished", state: "done" });
  } else {
    stages.push({ key: "devin", label: "Devin is working", state: "active", href: "#devin", hrefLabel: "Watch" });
  }

  // Pull request
  if (task.pullRequestUrl) {
    stages.push({ key: "pr", label: "Pull request opened", state: "done", href: task.pullRequestUrl, hrefLabel: "Open PR" });
  } else if (devinDone || devinFailed) {
    stages.push({ key: "pr", label: "No pull request opened", state: "skipped" });
  } else {
    stages.push(later("pr", "Pull request opened"));
  }

  // Jev review
  const review = task.jevopsReview;
  const awaitingRereview = !!review && task.jevopsReviewRound > review.round;
  if (awaitingRereview) {
    stages.push({ key: "jev", label: "Sent back to Devin, awaiting re-review", state: "active" });
  } else if (review) {
    stages.push({
      key: "jev",
      label: `Jev review: ${REVIEW_LABEL[review.disposition] ?? review.disposition.replace(/_/g, " ")}`,
      state: review.disposition === "allow" ? "done" : "action",
      detail: review.disposition === "allow" ? undefined : "See the Jev review under the Devin chat",
      href: "#devin",
      hrefLabel: "View review",
    });
  } else if (!task.pullRequestUrl) {
    stages.push({ key: "jev", label: "Jev reviews the PR", state: devinDone || devinFailed ? "skipped" : "pending" });
  } else if (!input.jevopsEnabled) {
    stages.push({ key: "jev", label: "Jev review skipped (JevOps not enabled)", state: "skipped" });
  } else if (!devinDone) {
    stages.push({ key: "jev", label: "Jev reviews the PR", state: "pending" });
  } else {
    const now = (input.now ?? new Date()).getTime();
    const waited = task.completedAt ? now - new Date(task.completedAt).getTime() : 0;
    stages.push(
      waited > REVIEW_WAIT_MS
        ? { key: "jev", label: "Jev review unavailable", state: "skipped", detail: "No review was recorded. Check the JevOps panel for errors" }
        : { key: "jev", label: "Jev is reviewing the PR", state: "active" }
    );
  }

  // Merge (driven by the GitHub webhook; can take days, so it never counts as "active")
  const outcome = review?.outcome;
  if (outcome) {
    stages.push(
      outcome.merged
        ? { key: "merge", label: `PR #${outcome.prNumber} merged`, state: "done", at: outcome.recordedAt }
        : { key: "merge", label: `PR #${outcome.prNumber} closed without merging`, state: "failed", at: outcome.recordedAt }
    );
  } else if (task.pullRequestUrl) {
    stages.push({ key: "merge", label: "Waiting for the PR to be merged", state: "pending" });
  } else {
    stages.push({ key: "merge", label: "PR merged", state: devinDone || devinFailed ? "skipped" : "pending" });
  }

  return stages;
}

const rerunStage = (ticketId: string): ProgressStage => ({
  key: "rerun",
  label: "Re-run the investigation",
  state: "action",
  detail: "Start a new investigation from the ticket page",
  href: `/tickets/${ticketId}`,
  hrefLabel: "Open ticket",
});

/** Returns null while the run has no human decision yet. */
export function buildApprovalProgress(input: ApprovalProgressInput): ApprovalProgress | null {
  const { approvalStatus } = input;
  let stages: ProgressStage[];

  if (approvalStatus === "approved") {
    stages = [
      {
        key: "decision",
        label: `Approved by ${actor(input)}`,
        state: "done",
        at: input.approvedAt ?? undefined,
        detail: input.reviewerNote ? `Note: ${input.reviewerNote}` : undefined,
      },
      processingStage(input),
      ...fixStages(input),
    ];
  } else if (approvalStatus === "rejected") {
    stages = [
      {
        key: "decision",
        label: `Rejected by ${actor(input)}`,
        state: "failed",
        at: input.approvedAt ?? undefined,
        detail: input.reviewerNote ? `Note: ${input.reviewerNote}` : undefined,
      },
      processingStage(input),
      rerunStage(input.ticketId),
    ];
  } else if (approvalStatus === "timeout") {
    stages = [
      {
        key: "decision",
        label: "Approval timed out",
        state: "failed",
        detail: "No decision within 72 hours, so the run was closed automatically",
      },
      rerunStage(input.ticketId),
    ];
  } else {
    return null;
  }

  return {
    decision: approvalStatus,
    stages,
    active: stages.some((s) => s.state === "active"),
  };
}
