import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const controlSchema = z.object({
  action: z.enum(["pause", "cancel", "restart"]),
});

const PAUSABLE = ["running", "pending", "awaiting_approval"];
const CANCELLABLE = ["running", "pending", "awaiting_approval", "paused"];
const RESTARTABLE = ["failed", "cancelled", "paused", "complete"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const body = await request.json();
  const parsed = controlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const run = await prisma.investigationRun.findUnique({
    where: { id: runId },
    include: { ticket: true },
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action } = parsed.data;

  if (action === "pause") {
    if (!PAUSABLE.includes(run.status)) {
      return NextResponse.json(
        { error: `Cannot pause investigation with status "${run.status}"` },
        { status: 409 }
      );
    }

    await prisma.investigationRun.update({
      where: { id: runId },
      data: { status: "paused" },
    });

    return NextResponse.json({ ok: true, runId, status: "paused" });
  }

  if (action === "cancel") {
    if (!CANCELLABLE.includes(run.status)) {
      return NextResponse.json(
        { error: `Cannot cancel investigation with status "${run.status}"` },
        { status: 409 }
      );
    }

    await prisma.investigationRun.update({
      where: { id: runId },
      data: {
        status: "cancelled",
        completedAt: new Date(),
        errorMessage: `Cancelled by user ${userId}`,
      },
    });

    return NextResponse.json({ ok: true, runId, status: "cancelled" });
  }

  if (action === "restart") {
    if (!RESTARTABLE.includes(run.status)) {
      return NextResponse.json(
        { error: `Cannot restart investigation with status "${run.status}"` },
        { status: 409 }
      );
    }

    // Reset the existing run
    await prisma.investigationRun.update({
      where: { id: runId },
      data: {
        status: "pending",
        completedAt: null,
        errorMessage: null,
        hypotheses: undefined,
        summary: null,
        escalationNote: null,
        guardrailsPassed: true,
        guardrailsResult: undefined,
        approvalStatus: null,
        approvedAt: null,
        approvedBy: null,
        editedReply: null,
        reviewerNote: null,
      },
    });

    // Delete old steps so the pipeline starts fresh
    await prisma.agentStep.deleteMany({
      where: { investigationRunId: runId },
    });

    // Fire a new Inngest event
    try {
      await inngest.send({
        name: "investigation/run.requested",
        data: { ticketId: run.ticketId, runId },
      });
    } catch (err) {
      await prisma.investigationRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          errorMessage: `Restart failed: ${(err as Error).message}`,
        },
      });
      return NextResponse.json(
        { error: "Failed to dispatch to Inngest. Is the dev server running?" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, runId, status: "pending" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
