import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string; stepId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId, stepId } = await params;

  const step = await prisma.agentStep.findFirst({
    where: { id: stepId, investigationRunId: runId },
  });

  if (!step) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(step);
}
