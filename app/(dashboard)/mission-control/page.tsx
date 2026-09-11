import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PriorityQueue } from "@/components/mission-control/priority-queue";
import { ResponsibilityMap } from "@/components/mission-control/responsibility-map";
import { ShiftBriefing } from "@/components/mission-control/shift-briefing";
import { WorkAssistant } from "@/components/mission-control/work-assistant";
import { NeedsClassificationQueue } from "@/components/mission-control/needs-classification-queue";

export default async function MissionControlPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const terminalStatuses = ["COMPLETED", "CANCELLED"];
  const orgFilter = orgId ? { orgId: { in: [orgId, ""] } } : { orgId: "" };

  const [workItems, statusCounts, pendingApprovals] = await Promise.all([
    prisma.workItem.findMany({
      where: {
        ...orgFilter,
        OR: [{ assigneeId: userId }, { assigneeId: null }],
        status: { notIn: terminalStatuses },
      },
      include: {
        ticket: { select: { id: true, title: true, severity: true, customer: { select: { name: true, company: true, plan: true } } } },
        incident: { select: { id: true, title: true, severity: true } },
        investigationRun: { select: { id: true, status: true } },
        devinTask: { select: { id: true, mode: true, status: true, verdict: true, pullRequestUrl: true, devinSessionId: true, repository: true, sessionUrl: true, startedAt: true, updatedAt: true, verdictReason: true } },
      },
      orderBy: { priorityScore: "desc" },
      take: 50,
    }),
    prisma.workItem.groupBy({
      by: ["status"],
      where: { ...orgFilter, OR: [{ assigneeId: userId }, { assigneeId: null }] },
      _count: true,
    }),
    prisma.investigationRun.count({
      where: { ...({ orgId: orgId ? { in: [orgId, ""] } : "" }), approvalStatus: "pending" },
    }),
  ]);

  // Also get recently completed for the responsibility map
  const recentlyCompleted = await prisma.workItem.count({
    where: {
      ...orgFilter,
      OR: [{ assigneeId: userId }, { assigneeId: null }],
      status: "COMPLETED",
      completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  const countMap: Record<string, number> = {};
  for (const row of statusCounts) {
    countMap[row.status] = row._count;
  }

  const responsibilityCounts = {
    needsAction: (countMap["OPEN"] ?? 0),
    inProgress: countMap["IN_PROGRESS"] ?? 0,
    waitingCustomer: countMap["WAITING_CUSTOMER"] ?? 0,
    waitingInternal: countMap["WAITING_INTERNAL"] ?? 0,
    snoozed: countMap["SNOOZED"] ?? 0,
    needsClassification: countMap["NEEDS_CLASSIFICATION"] ?? 0,
    recentlyCompleted,
    pendingApprovals,
  };

  // Serialize for client components
  const serializedItems = workItems.map((item) => ({
    ...item,
    dueAt: item.dueAt?.toISOString() ?? null,
    snoozedUntil: item.snoozedUntil?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    devinTask: item.devinTask
      ? {
          ...item.devinTask,
          startedAt: item.devinTask.startedAt?.toISOString() ?? null,
          updatedAt: item.devinTask.updatedAt.toISOString(),
        }
      : null,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Mission Control
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your prioritized work queue and active responsibilities
        </p>
      </div>

      <ShiftBriefing itemCount={workItems.length} urgentCount={workItems.filter((i) => i.priorityBand === "URGENT").length} />

      <ResponsibilityMap counts={responsibilityCounts} />

      <NeedsClassificationQueue items={serializedItems} />

      <PriorityQueue items={serializedItems} />

      <WorkAssistant />
    </div>
  );
}
