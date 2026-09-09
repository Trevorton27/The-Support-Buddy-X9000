// Work Context — server-only context builder for agent work summaries
import { prisma } from "@/lib/db";
import { runDeterministicChecks } from "@/lib/guardrails-rules";

export interface WorkContextSummary {
  agentId: string;
  orgId: string;
  activeCounts: {
    open: number;
    inProgress: number;
    waitingCustomer: number;
    waitingInternal: number;
    snoozed: number;
    needsClassification: number;
  };
  topPriorities: Array<{
    id: string;
    type: string;
    title: string;
    priorityScore: number;
    priorityBand: string;
    status: string;
    ticketId?: string | null;
  }>;
  risks: Array<{
    workItemId: string;
    title: string;
    reason: string;
  }>;
  recentChanges: Array<{
    workItemId: string;
    eventType: string;
    createdAt: string;
    note?: string | null;
  }>;
  sourceWorkItemIds: string[];
}

export async function buildWorkContext(agentId: string, orgId: string): Promise<WorkContextSummary> {
  const terminalStatuses = ["COMPLETED", "CANCELLED"];

  const assigneeFilter = { OR: [{ assigneeId: agentId }, { assigneeId: null }] };

  const [activeItems, recentEvents, statusCounts] = await Promise.all([
    prisma.workItem.findMany({
      where: {
        orgId: orgId ? { in: [orgId, ""] } : "",
        ...assigneeFilter,
        status: { notIn: terminalStatuses },
      },
      orderBy: { priorityScore: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        title: true,
        status: true,
        priorityScore: true,
        priorityBand: true,
        ticketId: true,
        dueAt: true,
        waitingOn: true,
        snoozedUntil: true,
      },
    }),
    prisma.workItemEvent.findMany({
      where: {
        workItem: { orgId: orgId ? { in: [orgId, ""] } : "", ...assigneeFilter },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        workItemId: true,
        eventType: true,
        createdAt: true,
        note: true,
      },
    }),
    prisma.workItem.groupBy({
      by: ["status"],
      where: {
        orgId: orgId ? { in: [orgId, ""] } : "",
        ...assigneeFilter,
        status: { notIn: terminalStatuses },
      },
      _count: true,
    }),
  ]);

  const countMap: Record<string, number> = {};
  for (const row of statusCounts) {
    countMap[row.status] = row._count;
  }

  // Identify risks: items due soon or waiting too long
  const now = new Date();
  const risks = activeItems
    .filter((item) => {
      if (item.dueAt && item.dueAt.getTime() - now.getTime() < 30 * 60 * 1000) return true;
      return false;
    })
    .map((item) => ({
      workItemId: item.id,
      title: item.title,
      reason: item.dueAt && item.dueAt.getTime() < now.getTime()
        ? "Overdue"
        : "Due within 30 minutes",
    }));

  return {
    agentId,
    orgId,
    activeCounts: {
      open: countMap["OPEN"] ?? 0,
      inProgress: countMap["IN_PROGRESS"] ?? 0,
      waitingCustomer: countMap["WAITING_CUSTOMER"] ?? 0,
      waitingInternal: countMap["WAITING_INTERNAL"] ?? 0,
      snoozed: countMap["SNOOZED"] ?? 0,
      needsClassification: countMap["NEEDS_CLASSIFICATION"] ?? 0,
    },
    topPriorities: activeItems.slice(0, 5).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      priorityScore: item.priorityScore,
      priorityBand: item.priorityBand,
      status: item.status,
      ticketId: item.ticketId,
    })),
    risks,
    recentChanges: recentEvents.map((e) => ({
      workItemId: e.workItemId,
      eventType: e.eventType,
      createdAt: e.createdAt.toISOString(),
      note: e.note,
    })),
    sourceWorkItemIds: activeItems.map((i) => i.id),
  };
}

export async function refreshWorkContext(agentId: string, orgId: string) {
  const context = await buildWorkContext(agentId, orgId);

  // Apply PII guardrails to summary text before storing
  const summaryText = `Agent ${agentId}: ${context.topPriorities.map((p) => p.title).join(", ")}`;
  const flags = runDeterministicChecks(summaryText);
  const safeSummary = flags.some((f) => f.severity === "block")
    ? "[PII redacted] Work context available"
    : summaryText;

  return prisma.agentWorkContext.upsert({
    where: { agentId_orgId: { agentId, orgId } },
    update: {
      summary: safeSummary,
      activeCounts: JSON.parse(JSON.stringify(context.activeCounts)),
      topPriorities: JSON.parse(JSON.stringify(context.topPriorities)),
      risks: JSON.parse(JSON.stringify(context.risks)),
      recentChanges: JSON.parse(JSON.stringify(context.recentChanges)),
      sourceWorkItemIds: JSON.parse(JSON.stringify(context.sourceWorkItemIds)),
      refreshedAt: new Date(),
    },
    create: {
      agentId,
      orgId,
      summary: safeSummary,
      activeCounts: JSON.parse(JSON.stringify(context.activeCounts)),
      topPriorities: JSON.parse(JSON.stringify(context.topPriorities)),
      risks: JSON.parse(JSON.stringify(context.risks)),
      recentChanges: JSON.parse(JSON.stringify(context.recentChanges)),
      sourceWorkItemIds: JSON.parse(JSON.stringify(context.sourceWorkItemIds)),
    },
  });
}
