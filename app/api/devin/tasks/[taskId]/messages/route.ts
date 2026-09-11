import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { getDevinAdapter } from "@/lib/integrations/devin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { taskId } = await params;

  const task = await prisma.devinTask.findUnique({ where: { id: taskId } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.orgId && task.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!task.devinSessionId) {
    return NextResponse.json({ messages: [], status: task.status });
  }

  try {
    const adapter = getDevinAdapter();
    const session = await adapter.getSession(task.devinSessionId);

    return NextResponse.json({
      messages: session.messages,
      status: task.status,
      sessionStatus: session.status_enum,
    });
  } catch (err) {
    console.error("[GET /api/devin/tasks/messages]", err);
    return NextResponse.json(
      { error: "Failed to fetch messages", messages: [] },
      { status: 502 }
    );
  }
}
