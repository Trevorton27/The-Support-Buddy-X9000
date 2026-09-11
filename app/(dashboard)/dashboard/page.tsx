import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { RecentInvestigations } from "@/components/dashboard/recent-investigations";

async function getDashboardData() {
  const [
    openTickets,
    criticalTickets,
    investigationsToday,
    completedInvestigations,
    recentInvestigations,
  ] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.ticket.count({ where: { status: { in: ["open", "in_progress"] }, severity: "critical" } }),
    prisma.investigationRun.count({
      where: {
        startedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.investigationRun.findMany({
      where: { status: "complete" },
      select: { startedAt: true, completedAt: true },
    }),
    prisma.investigationRun.findMany({
      where: { status: "complete" },
      take: 5,
      orderBy: { completedAt: "desc" },
      include: {
        ticket: { include: { customer: true } },
        steps: { take: 1, orderBy: { startedAt: "asc" } },
      },
    }),
  ]);

  const avgResolutionMs =
    completedInvestigations.length > 0
      ? completedInvestigations
          .filter((r) => r.completedAt)
          .reduce((sum, r) => {
            return sum + (r.completedAt!.getTime() - r.startedAt.getTime());
          }, 0) / completedInvestigations.length
      : 0;

  return {
    openTickets,
    criticalTickets,
    investigationsToday,
    avgResolutionMs,
    recentInvestigations,
  };
}

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const data = await getDashboardData();

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">AI-powered support operations overview</p>
      </div>

      <KpiCards
        openTickets={data.openTickets}
        criticalTickets={data.criticalTickets}
        investigationsToday={data.investigationsToday}
        avgResolutionMs={data.avgResolutionMs}
      />

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Recent Investigations</h2>
        <RecentInvestigations investigations={data.recentInvestigations} />
      </div>
    </div>
  );
}
