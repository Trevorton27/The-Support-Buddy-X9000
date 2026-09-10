/**
 * GitHub Webhook Processing — verifies signatures and processes push, PR, and check run events.
 *
 * Updates DemoRun records and DevinTask records when GitHub events relate
 * to demo scenario branches or Devin-created PRs.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { transitionRun } from "@/lib/demo-lab/lifecycle";

const logger = createLogger("webhook-github");

// ─── Signature Verification ───

export function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Event Types ───

interface GitHubPushEvent {
  ref: string;
  after: string;
  repository: { full_name: string };
  head_commit?: { message: string; id: string };
}

interface GitHubPullRequestEvent {
  action: string;
  pull_request: {
    number: number;
    html_url: string;
    head: { ref: string; sha: string };
    base: { ref: string };
    merged: boolean;
    state: string;
    title: string;
  };
  repository: { full_name: string };
}

interface GitHubCheckRunEvent {
  action: string;
  check_run: {
    name: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
    html_url: string;
    check_suite: { head_branch: string | null };
  };
  repository: { full_name: string };
}

// ─── Event Routing ───

export async function processGitHubEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<{ processed: boolean; detail?: string }> {
  switch (eventType) {
    case "push":
      return handlePush(payload as unknown as GitHubPushEvent);
    case "pull_request":
      return handlePullRequest(payload as unknown as GitHubPullRequestEvent);
    case "check_run":
      return handleCheckRun(payload as unknown as GitHubCheckRunEvent);
    default:
      return { processed: false, detail: `Ignored event type: ${eventType}` };
  }
}

// ─── Push Events ───

async function handlePush(event: GitHubPushEvent): Promise<{ processed: boolean; detail?: string }> {
  const branch = event.ref.replace("refs/heads/", "");

  // Only process demo branches
  if (!branch.startsWith("demo/")) {
    return { processed: false, detail: `Non-demo branch: ${branch}` };
  }

  const run = await prisma.demoRun.findFirst({
    where: { branch, status: { notIn: ["completed", "failed"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!run) {
    return { processed: false, detail: `No active run for branch: ${branch}` };
  }

  logger.info("GitHub push on demo branch", {
    branch,
    runId: run.id,
    commitSha: event.after,
    message: event.head_commit?.message,
  });

  // Track commit SHAs on the run
  const commitMessage = event.head_commit?.message ?? "";
  if (commitMessage.toLowerCase().includes("inject defect") || commitMessage.toLowerCase().includes("inject bug")) {
    await prisma.demoRun.update({
      where: { id: run.id },
      data: { brokenCommitSha: event.after },
    });
  }

  return { processed: true, detail: `Push tracked on run ${run.id}` };
}

// ─── Pull Request Events ───

async function handlePullRequest(event: GitHubPullRequestEvent): Promise<{ processed: boolean; detail?: string }> {
  const pr = event.pull_request;
  const headBranch = pr.head.ref;

  // Check if this PR's head branch matches a demo run
  const run = await prisma.demoRun.findFirst({
    where: {
      branch: headBranch,
      status: { notIn: ["completed", "failed"] },
    },
    orderBy: { createdAt: "desc" },
  });

  // Also check if this PR was created by a Devin task
  const devinTask = await prisma.devinTask.findFirst({
    where: {
      pullRequestUrl: pr.html_url,
      status: { notIn: ["finished", "failed", "expired", "cancelled"] },
    },
  });

  if (!run && !devinTask) {
    return { processed: false, detail: `PR not linked to any demo run or Devin task` };
  }

  logger.info("GitHub PR event on demo branch", {
    action: event.action,
    prNumber: pr.number,
    headBranch,
    runId: run?.id,
    devinTaskId: devinTask?.id,
  });

  switch (event.action) {
    case "opened":
    case "ready_for_review": {
      // PR opened — update run with PR URL and transition to pr_ready if applicable
      if (run && (run.status === "devin_fixing" || run.status === "devin_reproducing")) {
        await transitionRun(run.id, "pr_ready", `PR #${pr.number} opened`, {
          pullRequestUrl: pr.html_url,
        });
      } else if (run) {
        await prisma.demoRun.update({
          where: { id: run.id },
          data: { pullRequestUrl: pr.html_url },
        });
      }

      // Update Devin task with PR URL
      if (devinTask) {
        await prisma.devinTask.update({
          where: { id: devinTask.id },
          data: { pullRequestUrl: pr.html_url },
        });
      }

      return { processed: true, detail: `PR #${pr.number} opened → tracked` };
    }

    case "closed": {
      if (pr.merged) {
        // PR merged — transition to fixed
        if (run && run.status === "pr_ready") {
          await transitionRun(run.id, "fixed", `PR #${pr.number} merged`);
        }
        return { processed: true, detail: `PR #${pr.number} merged → fixed` };
      }
      // PR closed without merge — could mean fix was rejected
      return { processed: true, detail: `PR #${pr.number} closed without merge` };
    }

    case "synchronize": {
      // New commits pushed to PR
      if (run) {
        await prisma.demoRun.update({
          where: { id: run.id },
          data: { fixedCommitSha: pr.head.sha },
        });
      }
      return { processed: true, detail: `PR #${pr.number} updated` };
    }

    default:
      return { processed: false, detail: `Ignored PR action: ${event.action}` };
  }
}

// ─── Check Run Events ───

async function handleCheckRun(event: GitHubCheckRunEvent): Promise<{ processed: boolean; detail?: string }> {
  const checkRun = event.check_run;
  const branch = checkRun.check_suite.head_branch;

  if (!branch || !branch.startsWith("demo/")) {
    return { processed: false, detail: `Non-demo branch check run` };
  }

  if (event.action !== "completed") {
    return { processed: false, detail: `Check run not completed yet: ${checkRun.status}` };
  }

  const run = await prisma.demoRun.findFirst({
    where: { branch, status: { notIn: ["completed", "failed"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!run) {
    return { processed: false, detail: `No active run for branch: ${branch}` };
  }

  logger.info("GitHub check run completed on demo branch", {
    branch,
    runId: run.id,
    checkName: checkRun.name,
    conclusion: checkRun.conclusion,
  });

  // If tests failed on a broken branch, that confirms the defect is working
  if (checkRun.conclusion === "failure" && run.status === "broken") {
    logger.info("Test failure confirms defect injection", { runId: run.id, checkName: checkRun.name });
  }

  // If tests pass on a fix branch, that confirms the fix works
  if (checkRun.conclusion === "success" && run.status === "pr_ready") {
    logger.info("Tests pass on fix PR", { runId: run.id, checkName: checkRun.name });
  }

  return {
    processed: true,
    detail: `Check "${checkRun.name}" ${checkRun.conclusion} on run ${run.id}`,
  };
}
