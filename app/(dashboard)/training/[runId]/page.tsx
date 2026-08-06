import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TrainingRevealPanel } from "@/components/training/training-reveal-panel";
import { TrainingScorePanel } from "@/components/training/training-score-panel";
import Link from "next/link";
import type { TrainingScores } from "@/lib/generation/types";

export default async function TrainingRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { runId } = await params;

  const run = await prisma.investigationRun.findUnique({
    where: { id: runId },
    include: {
      ticket: { include: { generatedMeta: true } },
      steps: { orderBy: { startedAt: "asc" } },
    },
  });

  if (!run) notFound();

  const meta = run.ticket.generatedMeta;
  if (!meta) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">Not a training run</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This investigation is linked to a real (non-generated) ticket. Training analysis is only available for generated tickets.
          </p>
          <Link href="/training" className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-4 inline-block">
            Back to Training
          </Link>
        </div>
      </div>
    );
  }

  const hypotheses = Array.isArray(run.hypotheses)
    ? (run.hypotheses as Array<{ title: string; confidence: number; evidence: string[] }>)
    : [];
  const topHypothesis = hypotheses[0]?.title ?? run.summary ?? "";

  const rootCauseStep = run.steps.find((s) => s.agentName === "root_cause");
  const stepOutput = rootCauseStep?.output as Record<string, unknown> | null;
  const aiSeverity = String(stepOutput?.severity ?? run.ticket.severity);

  const injectedFaults = Array.isArray(meta.injectedFaults) ? (meta.injectedFaults as string[]) : [];
  const initialScores = meta.scoreCache as TrainingScores | null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
          <Link href="/training" className="hover:text-slate-700 dark:hover:text-slate-200">Training</Link>
          <span>/</span>
          <span>Session</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
          {run.ticket.title}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <Link
            href={`/investigations/${run.id}`}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View full investigation →
          </Link>
          <Link
            href={`/tickets/${run.ticketId}`}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View ticket →
          </Link>
        </div>
      </div>

      <TrainingRevealPanel
        ticketTitle={run.ticket.title}
        topHypothesis={topHypothesis}
        aiSeverity={aiSeverity}
        hypotheses={hypotheses}
        trueRootCause={meta.trueRootCause}
        trueSeverity={meta.trueSeverity}
        trueCategory={meta.trueCategory}
        affectedProduct={meta.affectedProduct}
        injectedFaults={injectedFaults}
        difficulty={meta.difficulty}
        scenario={meta.scenario}
        scenarioRole={meta.scenarioRole}
      />

      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Training Score</h2>
        <TrainingScorePanel runId={run.id} initialScores={initialScores} />
      </div>
    </div>
  );
}
