import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DifficultyDistributionChart } from "@/components/generate/difficulty-distribution-chart";

export default async function GenerateAnalyticsPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const metas = await prisma.generatedTicketMeta.findMany({
    where: { batch: { orgId: orgId ?? "" } },
    select: {
      difficulty: true,
      trueCategory: true,
      trueSeverity: true,
      scoreCache: true,
      createdAt: true,
    },
  });

  const totalGenerated = metas.length;
  const easyCount = metas.filter((m) => m.difficulty === "easy").length;
  const mediumCount = metas.filter((m) => m.difficulty === "medium").length;
  const hardCount = metas.filter((m) => m.difficulty === "hard").length;

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  for (const m of metas) {
    categoryMap[m.trueCategory] = (categoryMap[m.trueCategory] ?? 0) + 1;
  }
  const categories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  // Severity breakdown
  const severityMap: Record<string, number> = {};
  for (const m of metas) {
    severityMap[m.trueSeverity] = (severityMap[m.trueSeverity] ?? 0) + 1;
  }

  // Scored sessions
  const scored = metas.filter((m) => m.scoreCache !== null);
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, m) => {
          const cache = m.scoreCache as Record<string, unknown>;
          return sum + (typeof cache.overallScore === "number" ? cache.overallScore : 0);
        }, 0) / scored.length
      : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Generation Analytics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Distribution and performance metrics for all generated tickets.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalGenerated}</div>
          <div className="text-xs text-slate-500 mt-1">Total Generated</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{scored.length}</div>
          <div className="text-xs text-slate-500 mt-1">Scored Sessions</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {avgScore !== null ? `${Math.round(avgScore * 100)}%` : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">Avg Training Score</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {scored.length > 0
              ? `${Math.round((scored.filter((m) => (m.scoreCache as Record<string, unknown>)?.passed === true).length / scored.length) * 100)}%`
              : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">Pass Rate</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Difficulty distribution */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Difficulty Distribution</h2>
          <DifficultyDistributionChart easy={easyCount} medium={mediumCount} hard={hardCount} />
        </div>

        {/* Severity breakdown */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Severity Distribution</h2>
          {Object.keys(severityMap).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {(["critical", "high", "medium", "low"] as const)
                .filter((s) => severityMap[s] > 0)
                .map((s) => {
                  const count = severityMap[s] ?? 0;
                  const pct = totalGenerated > 0 ? (count / totalGenerated) * 100 : 0;
                  return (
                    <div key={s} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize text-slate-700 dark:text-slate-300">{s}</span>
                        <span className="tabular-nums text-slate-500">{count}</span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s === "critical" ? "bg-red-500" :
                            s === "high" ? "bg-orange-500" :
                            s === "medium" ? "bg-amber-500" : "bg-green-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Category breakdown */}
      {categories.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Category Breakdown (True)</h2>
          <div className="space-y-2">
            {categories.map(([cat, count]) => {
              const pct = totalGenerated > 0 ? (count / totalGenerated) * 100 : 0;
              return (
                <div key={cat} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300">{cat}</span>
                    <span className="tabular-nums text-slate-500">{count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
