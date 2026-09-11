import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime, formatDuration } from "@/lib/utils";

async function getInvestigations() {
  return prisma.investigationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      ticket: { include: { customer: true } },
      steps: true,
    },
  });
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  complete: "default",
  running: "secondary",
  pending: "outline",
  failed: "destructive",
  paused: "outline",
  cancelled: "outline",
};

export default async function InvestigationsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const investigations = await getInvestigations();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Investigations</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{investigations.length} runs</p>
      </div>

      <div className="space-y-3">
        {investigations.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              No investigations yet. Run one from a ticket.
            </CardContent>
          </Card>
        )}
        {investigations.map((run) => {
          const duration = run.completedAt
            ? run.completedAt.getTime() - run.startedAt.getTime()
            : null;

          return (
            <Link key={run.id} href={`/investigations/${run.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-base font-medium text-slate-900 dark:text-slate-100 leading-snug">
                      {run.ticket.title}
                    </CardTitle>
                    <Badge variant={statusVariant[run.status] ?? "outline"}>
                      {run.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>{run.ticket.customer.company}</span>
                    <span>{run.steps.length} steps</span>
                    {duration && <span>{formatDuration(duration)}</span>}
                    <span>{formatRelativeTime(run.startedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
