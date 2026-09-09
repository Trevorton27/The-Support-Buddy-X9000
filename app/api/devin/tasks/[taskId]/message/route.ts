import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { getDevinAdapter } from "@/lib/integrations/devin";
import { TERMINAL_STATUSES } from "@/lib/integrations/devin/types";

const messageSchema = z.object({
  message: z.string().min(1).max(10000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { taskId } = await params;

  const body = await request.json();
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await prisma.devinTask.findUnique({ where: { id: taskId } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.orgId && task.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!task.devinSessionId) {
    return NextResponse.json({ error: "Session not yet created" }, { status: 400 });
  }
  if (TERMINAL_STATUSES.includes(task.status as typeof TERMINAL_STATUSES[number])) {
    return NextResponse.json({ error: "Session is no longer active" }, { status: 400 });
  }

  const adapter = getDevinAdapter();
  await adapter.sendMessage(task.devinSessionId, parsed.data.message);

  return NextResponse.json({ ok: true });
}
