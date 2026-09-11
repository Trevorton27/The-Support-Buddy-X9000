import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PassRateChart } from "@/components/eval/pass-rate-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import { FlaskConical, CheckCircle2, XCircle } from "lucide-react";

export default async function EvalPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const runs = await prisma.evalRun.findMany({
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { results: true } } },
    take: 20,
  });

  const exampleCount = await prisma.evalExample.count();

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-6 h-6 text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Eval Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {runs.length} run{runs.length !== 1 ? "s" : ""} · {exampleCount} example{exampleCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Link
          href="/eval/examples"
          className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2"
        >
          Manage examples →
        </Link>
      </div>

      {runs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pass Rate Trend</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PassRateChart runs={runs} />
          </CardContent>
        </Card>
      )}

      {runs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No eval runs yet. Run <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">npx tsx scripts/run-eval.ts --name my-run</code> to start.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Run History</h2>
          {runs.map((run) => {
            const passRate = run.passRate ?? null;
            const passed = passRate !== null && passRate >= 0.7;
            return (
              <Link key={run.id} href={`/eval/${run.id}`}>
                <Card className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    {run.status === "complete" ? (
                      passed
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{run.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 font-mono">
                          {run.model}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-xs shrink-0 ${run.status === "complete" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300" : run.status === "failed" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}
                        >
                          {run.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>{run._count.results} examples</span>
                        {passRate !== null && (
                          <>
                            <span>·</span>
                            <span className={passed ? "text-green-600 dark:text-green-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                              {Math.round(passRate * 100)}% pass rate
                            </span>
                          </>
                        )}
                        {run.avgScore !== null && (
                          <>
                            <span>·</span>
                            <span>avg {run.avgScore.toFixed(2)}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatRelativeTime(run.startedAt)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
