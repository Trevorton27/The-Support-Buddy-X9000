import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { scoreTrainingRun } from "@/lib/generation/training-scorer";
import type { TrainingScoreInput } from "@/lib/generation/types";

const BodySchema = z.object({
  investigationRunId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const { response: authError } = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const { investigationRunId } = parsed.data;

  const run = await prisma.investigationRun.findUnique({
    where: { id: investigationRunId },
    include: {
      ticket: { include: { generatedMeta: true } },
      steps: true,
    },
  });

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (!run.ticket.generatedMeta) {
    return NextResponse.json({ error: "Not a training run — ticket has no generated metadata" }, { status: 422 });
  }

  const meta = run.ticket.generatedMeta;
  const hypotheses = Array.isArray(run.hypotheses)
    ? (run.hypotheses as Array<{ title: string; confidence: number; evidence: string[] }>)
    : [];
  const topHypothesis = hypotheses[0]?.title ?? run.summary ?? "";

  // Derive severity from root-cause step output or summary
  const rootCauseStep = run.steps.find((s) => s.agentName === "root_cause");
  const stepOutput = rootCauseStep?.output as Record<string, unknown> | null;
  const actualSeverity = String(stepOutput?.severity ?? run.ticket.severity);

  const input: TrainingScoreInput = {
    ticketTitle: run.ticket.title,
    ticketDescription: run.ticket.description,
    trueRootCause: meta.trueRootCause,
    trueSeverity: meta.trueSeverity,
    injectedFaults: Array.isArray(meta.injectedFaults) ? (meta.injectedFaults as string[]) : [],
    difficulty: meta.difficulty,
    actualTopHypothesis: topHypothesis,
    actualSeverityClassification: actualSeverity,
    hypotheses,
  };

  const scores = await scoreTrainingRun(input);

  // Write-through cache to DB
  await prisma.generatedTicketMeta.update({
    where: { id: meta.id },
    data: {
      scoreCache: JSON.parse(JSON.stringify(scores)),
      scoredAt: new Date(),
    },
  });

  return NextResponse.json(scores);
}
