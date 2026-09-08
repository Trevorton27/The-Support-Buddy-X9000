import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { taskId } = await params;

  const task = await prisma.devinTask.findUnique({
    where: { id: taskId },
    include: {
      ticket: { select: { id: true, title: true, severity: true } },
      investigationRun: { select: { id: true, status: true } },
      workItem: { select: { id: true, status: true, priorityBand: true } },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(task);
}
