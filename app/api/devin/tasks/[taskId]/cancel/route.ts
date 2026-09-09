import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { transitionWorkItem } from "@/lib/work-items";
import { getDevinAdapter } from "@/lib/integrations/devin";
import { TERMINAL_STATUSES } from "@/lib/integrations/devin/types";
import { createLogger } from "@/lib/logger";

const logger = createLogger("devin-cancel");

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { taskId } = await params;

  const task = await prisma.devinTask.findUnique({ where: { id: taskId } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.orgId && task.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (TERMINAL_STATUSES.includes(task.status as typeof TERMINAL_STATUSES[number])) {
    return NextResponse.json({ error: "Task is already in a terminal state" }, { status: 400 });
  }

  // Best-effort: tell Devin to stop
  if (task.devinSessionId) {
    try {
      const adapter = getDevinAdapter();
      await adapter.sendMessage(
        task.devinSessionId,
        "STOP: This task has been cancelled by the operator. Please cease all work immediately. Do not create any PRs or make further changes."
      );
    } catch (e) {
      logger.warn("Failed to send stop message to Devin", {
        taskId,
        error: (e as Error).message,
      });
    }
  }

  // Update task status
  await prisma.devinTask.update({
    where: { id: taskId },
    data: { status: "cancelled", completedAt: new Date() },
  });

  // Transition linked WorkItem
  if (task.workItemId) {
    try {
      await transitionWorkItem(task.workItemId, "CANCELLED", userId!, "user", "Task cancelled by user");
    } catch (e) {
      logger.warn("Failed to cancel work item", { workItemId: task.workItemId, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}
