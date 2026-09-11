import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const approveSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  editedReply: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const body = await request.json();
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const run = await prisma.investigationRun.findUnique({
    where: { id: runId },
    include: { ticket: true },
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (run.approvalStatus !== "pending") {
    return NextResponse.json({ error: "Run is not pending approval" }, { status: 409 });
  }

  const { action, editedReply, note } = parsed.data;

  // Always write to DB regardless of Inngest state (resilient fallback)
  await prisma.approvalAudit.create({
    data: {
      investigationRunId: runId,
      action,
      actorId: userId,
      originalDraft: run.summary || "",
      finalDraft: editedReply || run.summary || null,
      note: note || null,
    },
  });

  // Update the run directly (Inngest will also update via event, idempotent)
  await prisma.investigationRun.update({
    where: { id: runId },
    data: {
      approvalStatus: action,
      approvedAt: new Date(),
      approvedBy: userId,
      editedReply: action === "approved" ? (editedReply || null) : null,
      reviewerNote: note || null,
    },
  });

  // Fire Inngest event to resume the waitForEvent step
  await inngest.send({
    name: "investigation/approval.submitted",
    data: {
      runId,
      action,
      editedReply,
      note,
      actorId: userId,
      originalDraft: run.summary || "",
    },
  });

  return NextResponse.json({ ok: true, runId, action });
}
