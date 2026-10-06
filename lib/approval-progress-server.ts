import { prisma } from "@/lib/db";
import { isJevOpsEnabled } from "@/lib/integrations/jevops/client";
import type { DevinJevReview } from "@/lib/integrations/jevops/devin-review-shared";
import { buildApprovalProgress, type ApprovalProgress } from "./approval-progress";

/** Load everything the post-decision tracker needs for one run. Null if the run doesn't exist or isn't decided. */
export async function loadApprovalProgress(runId: string, viewerId: string): Promise<ApprovalProgress | null> {
  const run = await prisma.investigationRun.findUnique({
    where: { id: runId },
    select: {
      approvalStatus: true,
      status: true,
      approvedAt: true,
      approvedBy: true,
      reviewerNote: true,
      ticketId: true,
      devinTasks: {
        where: { mode: "fix" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          pullRequestUrl: true,
          jevopsReview: true,
          jevopsReviewRound: true,
          startedAt: true,
          completedAt: true,
        },
      },
    },
  });
  if (!run) return null;

  const approver = run.approvedBy
    ? await prisma.user.findUnique({ where: { id: run.approvedBy }, select: { name: true } })
    : null;
  const fix = run.devinTasks[0];

  return buildApprovalProgress({
    approvalStatus: run.approvalStatus,
    status: run.status,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    approverName: approver?.name ?? null,
    approverIsViewer: run.approvedBy === viewerId,
    reviewerNote: run.reviewerNote,
    ticketId: run.ticketId,
    jevopsEnabled: isJevOpsEnabled(),
    fixTask: fix
      ? {
          status: fix.status,
          pullRequestUrl: fix.pullRequestUrl,
          jevopsReview: fix.jevopsReview as unknown as DevinJevReview | null,
          jevopsReviewRound: fix.jevopsReviewRound,
          startedAt: fix.startedAt?.toISOString() ?? null,
          completedAt: fix.completedAt?.toISOString() ?? null,
        }
      : null,
  });
}

/** Oldest pending approval other than `excludeRunId` (same SLA order as the queue). */
export async function getNextPendingRunId(excludeRunId?: string): Promise<string | null> {
  const next = await prisma.investigationRun.findFirst({
    where: { approvalStatus: "pending", ...(excludeRunId ? { id: { not: excludeRunId } } : {}) },
    orderBy: { startedAt: "asc" },
    select: { id: true },
  });
  return next?.id ?? null;
}
