import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const schema = z.object({
  ticketId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ticketId } = parsed.data;

  // Verify ticket exists
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // Create investigation run record
  const run = await prisma.investigationRun.create({
    data: {
      ticketId,
      status: "pending",
    },
  });

  // Fire Inngest event
  try {
    await inngest.send({
      name: "investigation/run.requested",
      data: { ticketId, runId: run.id },
    });
  } catch (err) {
    // Inngest dev server may not be running — update run status but still return the runId
    // so the user can see the pending investigation
    await prisma.investigationRun.update({
      where: { id: run.id },
      data: { status: "failed", errorMessage: `Failed to dispatch to Inngest: ${(err as Error).message}. Is the Inngest dev server running? (npx inngest-cli@latest dev)` },
    });
    return NextResponse.json({
      runId: run.id,
      warning: "Investigation created but Inngest event dispatch failed. Start the Inngest dev server: npx inngest-cli@latest dev",
    }, { status: 201 });
  }

  return NextResponse.json({ runId: run.id }, { status: 201 });
}
