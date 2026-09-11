import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Bot } from "lucide-react";
import { DevinDashboard, type DevinTaskRow, type DevinStats } from "@/components/devin/devin-dashboard";

export default async function DevinPage() {
  const { orgId } = await auth();

  const tasks = await prisma.devinTask.findMany({
    where: orgId ? { orgId } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      ticket: { select: { id: true, title: true, severity: true } },
      investigationRun: { select: { id: true, status: true } },
    },
  });

  const rows: DevinTaskRow[] = tasks.map((t) => ({
    id: t.id,
    mode: t.mode,
    status: t.status,
    verdict: t.verdict,
    verdictReason: t.verdictReason,
    pullRequestUrl: t.pullRequestUrl,
    repository: t.repository,
    devinSessionId: t.devinSessionId,
    sessionUrl: t.sessionUrl,
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    pollCount: t.pollCount,
    ticketTitle: t.ticket?.title ?? null,
    ticketId: t.ticketId,
    ticketSeverity: t.ticket?.severity ?? null,
    investigationId: t.investigationRunId,
    investigationStatus: t.investigationRun?.status ?? null,
  }));

  const activeStatuses = ["queued", "creating", "working", "blocked", "waiting", "pr_ready"];

  const stats: DevinStats = {
    total: rows.length,
    active: rows.filter((r) => activeStatuses.includes(r.status)).length,
    finished: rows.filter((r) => r.status === "finished").length,
    failed: rows.filter((r) => ["failed", "expired"].includes(r.status)).length,
    reproduced: rows.filter((r) => r.verdict === "REPRODUCED").length,
    fixesSubmitted: rows.filter((r) => r.verdict === "FIX_SUBMITTED").length,
    avgPollCount: rows.length > 0 ? rows.reduce((sum, r) => sum + r.pollCount, 0) / rows.length : 0,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Devin AI</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitor automated bug reproduction, code fixes, and defect authoring sessions
          </p>
        </div>
      </div>

      <DevinDashboard tasks={rows} stats={stats} />
    </div>
  );
}
