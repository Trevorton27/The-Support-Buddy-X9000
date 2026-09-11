import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TrainingLeaderboard } from "@/components/training/training-leaderboard";
import { TrainingSessionsTable } from "@/components/training/training-sessions-table";

export default async function TrainingPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  // Fetch investigation runs linked to generated tickets
  const runs = await prisma.investigationRun.findMany({
    where: {
      orgId: orgId ?? "",
      ticket: { generatedMeta: { isNot: null } },
    },
    include: {
      ticket: {
        include: { generatedMeta: true },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  // Build leaderboard stats from score caches
  const metasWithScores = runs
    .map((r) => r.ticket.generatedMeta)
    .filter((m): m is NonNullable<typeof m> => m !== null && m.scoreCache !== null);

  const groupedStats = ["easy", "medium", "hard"].map((difficulty) => {
    const group = metasWithScores.filter((m) => m.difficulty === difficulty);
    if (group.length === 0) {
      return { difficulty, count: 0, avgRootCauseScore: 0, avgSeverityScore: 0, avgDeceptionScore: 0, avgOverallScore: 0, passRate: 0 };
    }
    const avgRootCauseScore = group.reduce((s, m) => s + ((m.scoreCache as Record<string, unknown>)?.rootCauseScore as number ?? 0), 0) / group.length;
    const avgSeverityScore = group.reduce((s, m) => s + ((m.scoreCache as Record<string, unknown>)?.severityScore as number ?? 0), 0) / group.length;
    const avgDeceptionScore = group.reduce((s, m) => s + ((m.scoreCache as Record<string, unknown>)?.deceptionResistanceScore as number ?? 0), 0) / group.length;
    const avgOverallScore = group.reduce((s, m) => s + ((m.scoreCache as Record<string, unknown>)?.overallScore as number ?? 0), 0) / group.length;
    const passRate = group.filter((m) => (m.scoreCache as Record<string, unknown>)?.passed === true).length / group.length;
    return { difficulty, count: group.length, avgRootCauseScore, avgSeverityScore, avgDeceptionScore, avgOverallScore, passRate };
  });

  const sessions = runs.map((r) => {
    const meta = r.ticket.generatedMeta;
    const scoreCache = meta?.scoreCache as Record<string, unknown> | null;
    return {
      runId: r.id,
      ticketTitle: r.ticket.title,
      difficulty: meta?.difficulty ?? "medium",
      affectedProduct: meta?.affectedProduct ?? r.ticket.product ?? "—",
      overallScore: typeof scoreCache?.overallScore === "number" ? scoreCache.overallScore : null,
      passed: typeof scoreCache?.passed === "boolean" ? scoreCache.passed : null,
      investigationStatus: r.status,
    };
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Training Mode</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track AI performance on generated tickets with hidden ground truth.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Performance by Difficulty</h2>
        <TrainingLeaderboard stats={groupedStats} />
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Training Sessions ({sessions.length})
        </h2>
        <TrainingSessionsTable sessions={sessions} />
      </div>
    </div>
  );
}
