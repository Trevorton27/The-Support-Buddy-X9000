import { prisma } from "./db";
import { runInvestigation } from "@/agents/graph";
import { judgeInvestigation } from "./eval-judge";
import { createLogger } from "./logger";
import type { Hypothesis } from "@/agents/state";

const logger = createLogger("eval-runner");

export async function runEvalSuite(
  evalRunId: string,
  exampleIds?: string[],
  model?: string
): Promise<void> {
  const where = exampleIds && exampleIds.length > 0 ? { id: { in: exampleIds } } : {};
  const examples = await prisma.evalExample.findMany({ where });

  if (examples.length === 0) {
    await prisma.evalRun.update({
      where: { id: evalRunId },
      data: { status: "complete", completedAt: new Date(), passRate: 0, avgScore: 0 },
    });
    return;
  }

  // Find a demo customer to attach eval tickets to
  const demoCustomer = await prisma.customer.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!demoCustomer) {
    throw new Error("No demo customer found. Run npm run seed first.");
  }

  let totalScore = 0;
  let passCount = 0;

  for (const example of examples) {
    logger.info("Evaluating example", { exampleId: example.id, title: example.ticketTitle });

    // Create ephemeral ticket for this eval run
    const ticket = await prisma.ticket.create({
      data: {
        title: `[EVAL] ${example.ticketTitle}`,
        description: example.ticketDescription,
        severity: example.expectedSeverity,
        status: "open",
        customerId: demoCustomer.id,
        externalId: `EVAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    });

    // Create investigation run
    const run = await prisma.investigationRun.create({
      data: {
        ticketId: ticket.id,
        status: "pending",
      },
    });

    let investigationRunId: string | undefined;
    let rootCauseScore = 0;
    let evidenceScore = 0;
    let toneScore = 0;
    let hallucinationScore = 0;
    let overallScore = 0;
    let passed = false;
    let judgeOutput: Record<string, unknown> = {};

    try {
      // Run investigation directly (bypassing Inngest)
      await runInvestigation(ticket.id, run.id, model);
      investigationRunId = run.id;

      // Load results
      const completedRun = await prisma.investigationRun.findUnique({
        where: { id: run.id },
      });

      const hypotheses = ((completedRun?.hypotheses ?? []) as unknown as Hypothesis[]);
      const topHypothesis = hypotheses[0];

      const scores = await judgeInvestigation({
        ticketTitle: example.ticketTitle,
        ticketDescription: example.ticketDescription,
        expectedRootCause: example.expectedRootCause,
        expectedSeverity: example.expectedSeverity,
        expectedEvidenceKeywords: (example.expectedEvidenceKeywords as string[]),
        approvedReply: example.approvedReply,
        actualRootCause: topHypothesis?.title ?? "",
        actualReply: completedRun?.summary ?? "",
        hypotheses: hypotheses.map((h) => ({
          title: h.title,
          confidence: h.confidence,
          evidence: h.evidence,
        })),
      });

      rootCauseScore = scores.rootCauseScore;
      evidenceScore = scores.evidenceScore;
      toneScore = scores.toneScore;
      hallucinationScore = scores.hallucinationScore;
      overallScore = scores.overallScore;
      passed = scores.passed;
      judgeOutput = { reasoning: scores.reasoning };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("Eval run failed for example", { exampleId: example.id, error: msg });
      judgeOutput = { error: msg };
    }

    await prisma.evalResult.create({
      data: {
        evalRunId,
        evalExampleId: example.id,
        investigationRunId,
        rootCauseScore,
        evidenceScore,
        toneScore,
        hallucinationScore,
        overallScore,
        judgeOutput: JSON.parse(JSON.stringify(judgeOutput)),
        passed,
      },
    });

    totalScore += overallScore;
    if (passed) passCount++;
  }

  const passRate = passCount / examples.length;
  const avgScore = totalScore / examples.length;

  await prisma.evalRun.update({
    where: { id: evalRunId },
    data: {
      status: "complete",
      completedAt: new Date(),
      passRate,
      avgScore,
    },
  });

  logger.info("Eval suite complete", { evalRunId, passRate, avgScore, total: examples.length });
}
