// Work Items — CRUD + state machine with audit trail
import { prisma } from "@/lib/db";
import { calculatePriority, type PriorityContext } from "@/lib/priority-engine";

// Valid state transitions
const STATE_MACHINE: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "SNOOZED", "CANCELLED", "NEEDS_CLASSIFICATION"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "WAITING_INTERNAL", "COMPLETED", "SNOOZED", "CANCELLED", "OPEN"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "OPEN", "COMPLETED", "CANCELLED"],
  WAITING_INTERNAL: ["IN_PROGRESS", "OPEN", "COMPLETED", "CANCELLED"],
  SNOOZED: ["OPEN"],
  NEEDS_CLASSIFICATION: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function isValidTransition(from: string, to: string): boolean {
  return STATE_MACHINE[from]?.includes(to) ?? false;
}

export async function createWorkItem(data: {
  orgId: string;
  type: string;
  title: string;
  summary?: string;
  requiredAction?: string;
  reason?: string;
  assigneeId?: string;
  priorityContext?: PriorityContext;
  dueAt?: Date;
  confidence?: number;
  sourceType?: string;
  sourceId?: string;
  ticketId?: string;
  investigationRunId?: string;
  incidentId?: string;
  status?: string;
  actorId?: string;
  actorType?: "user" | "system" | "ai";
}) {
  const priority = data.priorityContext
    ? calculatePriority(data.priorityContext)
    : { score: 50, band: "MEDIUM" as const, breakdown: {} };

  return prisma.$transaction(async (tx) => {
    const workItem = await tx.workItem.create({
      data: {
        orgId: data.orgId,
        type: data.type,
        status: data.status ?? "OPEN",
        title: data.title,
        summary: data.summary,
        requiredAction: data.requiredAction,
        reason: data.reason,
        assigneeId: data.assigneeId,
        priorityScore: priority.score,
        priorityBand: priority.band,
        dueAt: data.dueAt,
        confidence: data.confidence,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        ticketId: data.ticketId,
        investigationRunId: data.investigationRunId,
        incidentId: data.incidentId,
      },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: workItem.id,
        eventType: "created",
        actorId: data.actorId,
        actorType: data.actorType ?? "system",
        newValue: JSON.parse(JSON.stringify({
          type: workItem.type,
          status: workItem.status,
          priorityScore: workItem.priorityScore,
          priorityBand: workItem.priorityBand,
        })),
      },
    });

    return workItem;
  });
}

export async function transitionWorkItem(
  id: string,
  newStatus: string,
  actorId?: string,
  actorType: "user" | "system" | "ai" = "system",
  note?: string
) {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id } });

  if (!isValidTransition(workItem.status, newStatus)) {
    throw new Error(`Invalid transition: ${workItem.status} → ${newStatus}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: id,
        eventType: "status_changed",
        actorId,
        actorType,
        previousValue: JSON.parse(JSON.stringify({ status: workItem.status })),
        newValue: JSON.parse(JSON.stringify({ status: newStatus })),
        note,
      },
    });

    return updated;
  });
}

export async function snoozeWorkItem(id: string, until: Date, actorId?: string) {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id } });

  if (!isValidTransition(workItem.status, "SNOOZED")) {
    throw new Error(`Cannot snooze from status: ${workItem.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data: { status: "SNOOZED", snoozedUntil: until },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: id,
        eventType: "snoozed",
        actorId,
        actorType: "user",
        previousValue: JSON.parse(JSON.stringify({ status: workItem.status })),
        newValue: JSON.parse(JSON.stringify({ status: "SNOOZED", snoozedUntil: until.toISOString() })),
      },
    });

    return updated;
  });
}

export async function resumeWorkItem(id: string, actorId?: string) {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id } });

  if (!isValidTransition(workItem.status, "OPEN")) {
    throw new Error(`Cannot resume from status: ${workItem.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data: { status: "OPEN", snoozedUntil: null },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: id,
        eventType: "resumed",
        actorId,
        actorType: actorId ? "user" : "system",
        previousValue: JSON.parse(JSON.stringify({ status: workItem.status })),
        newValue: JSON.parse(JSON.stringify({ status: "OPEN" })),
      },
    });

    return updated;
  });
}

export async function delegateWorkItem(id: string, toUserId: string, actorId: string) {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id } });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data: { assigneeId: toUserId },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: id,
        eventType: "delegated",
        actorId,
        actorType: "user",
        previousValue: JSON.parse(JSON.stringify({ assigneeId: workItem.assigneeId })),
        newValue: JSON.parse(JSON.stringify({ assigneeId: toUserId })),
      },
    });

    return updated;
  });
}

export async function completeWorkItem(id: string, actorId?: string, note?: string) {
  return transitionWorkItem(id, "COMPLETED", actorId, actorId ? "user" : "system", note);
}

export async function correctPriority(
  id: string,
  newScore: number,
  actorId: string,
  reason: string
) {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id } });

  const band =
    newScore >= 80 ? "URGENT" :
    newScore >= 60 ? "HIGH" :
    newScore >= 30 ? "MEDIUM" : "LOW";

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data: { priorityScore: newScore, priorityBand: band },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: id,
        eventType: "corrected",
        actorId,
        actorType: "user",
        previousValue: JSON.parse(JSON.stringify({
          priorityScore: workItem.priorityScore,
          priorityBand: workItem.priorityBand,
        })),
        newValue: JSON.parse(JSON.stringify({
          priorityScore: newScore,
          priorityBand: band,
        })),
        note: reason,
      },
    });

    return updated;
  });
}

export async function setWaiting(
  id: string,
  waitingOn: string,
  waitType: "WAITING_CUSTOMER" | "WAITING_INTERNAL",
  actorId?: string
) {
  const workItem = await prisma.workItem.findUniqueOrThrow({ where: { id } });

  if (!isValidTransition(workItem.status, waitType)) {
    throw new Error(`Cannot set waiting from status: ${workItem.status}`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workItem.update({
      where: { id },
      data: { status: waitType, waitingOn },
    });

    await tx.workItemEvent.create({
      data: {
        workItemId: id,
        eventType: "waiting_set",
        actorId,
        actorType: actorId ? "user" : "system",
        previousValue: JSON.parse(JSON.stringify({ status: workItem.status })),
        newValue: JSON.parse(JSON.stringify({ status: waitType, waitingOn })),
      },
    });

    return updated;
  });
}

// Re-export for convenience
export { isValidTransition, STATE_MACHINE };
