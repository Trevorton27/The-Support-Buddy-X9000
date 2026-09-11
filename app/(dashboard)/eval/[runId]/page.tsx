import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ScoreCard } from "@/components/eval/score-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import type { EvalResult, EvalExample } from "@prisma/client";

type ResultWithExample = EvalResult & { evalExample: EvalExample };

export default async function EvalRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { runId } = await params;

  const run = await prisma.evalRun.findUnique({
    where: { id: runId },
    include: {
      results: {
        include: { evalExample: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!run) notFound();

  const failures = run.results.filter((r) => !r.passed);
  const passes = run.results.filter((r) => r.passed);

  function ResultCard({ result }: { result: ResultWithExample }) {
    return (
      <Card className={!result.passed ? "border-red-100 dark:border-red-900" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-900 dark:text-slate-100">
            {result.evalExample.ticketTitle}
          </CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
            {result.evalExample.ticketDescription}
          </p>
        </CardHeader>
        <CardContent>
          <ScoreCard
            rootCauseScore={result.rootCauseScore}
            evidenceScore={result.evidenceScore}
            toneScore={result.toneScore}
            hallucinationScore={result.hallucinationScore}
            overallScore={result.overallScore}
            passed={result.passed}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-sm text-slate-500">
        <Link href="/eval" className="hover:text-slate-900 dark:hover:text-slate-100">Eval Dashboard</Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-xs">{run.id.slice(0, 8)}...</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{run.name}</h1>
          <Badge variant="outline" className="font-mono text-purple-700 bg-purple-50 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300">
            {run.model}
          </Badge>
          <Badge
            variant="outline"
            className={run.status === "complete" ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200"}
          >
            {run.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>{run.results.length} examples</span>
          {run.passRate !== null && (
            <>
              <span>·</span>
              <span className={run.passRate >= 0.7 ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                {Math.round(run.passRate * 100)}% pass rate
              </span>
            </>
          )}
          {run.avgScore !== null && (
            <>
              <span>·</span>
              <span>avg score {run.avgScore.toFixed(2)}</span>
            </>
          )}
          <span>·</span>
          <span>{formatRelativeTime(run.startedAt)}</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{passes.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Passed</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{failures.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Failed</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {run.avgScore !== null ? run.avgScore.toFixed(2) : "—"}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Avg Score</div>
        </Card>
      </div>

      {/* Failures first */}
      {failures.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1.5">
            <XCircle className="w-4 h-4" />
            Failures ({failures.length})
          </h2>
          {failures.map((result) => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      )}

      {/* Passes */}
      {passes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Passed ({passes.length})
          </h2>
          {passes.map((result) => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
