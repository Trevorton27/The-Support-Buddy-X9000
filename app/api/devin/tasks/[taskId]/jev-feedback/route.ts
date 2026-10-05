import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { getDevinAdapter } from "@/lib/integrations/devin";
import {
  buildDevinFeedbackMessage,
  MAX_JEV_FEEDBACK_ROUNDS,
  type DevinJevReview,
} from "@/lib/integrations/jevops/devin-review-shared";

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
});

// POST — send the latest JevOps review back to Devin as feedback and resume polling for a re-review
export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { taskId } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
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

  const review = task.jevopsReview as unknown as DevinJevReview | null;
  if (!review) {
    return NextResponse.json({ error: "No JevOps review to send" }, { status: 400 });
  }
  if (task.jevopsReviewRound >= MAX_JEV_FEEDBACK_ROUNDS) {
    return NextResponse.json(
      { error: `Feedback limit reached (${MAX_JEV_FEEDBACK_ROUNDS} rounds). Review the PR manually.` },
      { status: 409 }
    );
  }
  if (!["finished", "failed", "expired", "blocked", "waiting"].includes(task.status)) {
    return NextResponse.json({ error: "Devin is still working on this task" }, { status: 409 });
  }

  await getDevinAdapter().sendMessage(task.devinSessionId, buildDevinFeedbackMessage(review, parsed.data.note));

  const updated = await prisma.devinTask.update({
    where: { id: taskId },
    data: {
      jevopsReviewRound: { increment: 1 },
      status: "working",
      completedAt: null,
    },
  });

  await inngest.send({ name: "devin/task.resumed", data: { devinTaskId: taskId } });

  return NextResponse.json({ ok: true, round: updated.jevopsReviewRound });
}
