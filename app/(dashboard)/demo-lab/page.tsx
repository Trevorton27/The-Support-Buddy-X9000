import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScenarioCard } from "@/components/demo-lab/scenario-card";
import type { ScenarioData } from "@/components/demo-lab/scenario-card";
import { GenerateScenarioDialog } from "@/components/demo-lab/generate-scenario-dialog";
import { DefectAuthorWizard } from "@/components/demo-lab/defect-author-wizard";

export default async function DemoLabPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const scenarios = await prisma.demoIssueScenario.findMany({
    where: { orgId: { in: [orgId ?? "", ""] } },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { key: "asc" },
  });

  const activeCount = scenarios.filter((s) => s.status !== "available" && s.status !== "completed").length;
  const totalRuns = scenarios.reduce((sum, s) => sum + s.generation, 0);

  // Group by service
  const serviceGroups = new Map<string, typeof scenarios>();
  for (const s of scenarios) {
    if (!serviceGroups.has(s.service)) serviceGroups.set(s.service, []);
    serviceGroups.get(s.service)!.push(s);
  }

  // Serialize for client components
  const serializeScenario = (s: typeof scenarios[number]): ScenarioData => ({
    id: s.id,
    key: s.key,
    title: s.title,
    description: s.description,
    service: s.service,
    severity: s.severity,
    difficulty: s.difficulty,
    category: s.category,
    status: s.status,
    generation: s.generation,
    activeBranch: s.activeBranch,
    activeTicketId: s.activeTicketId,
    activeDevinTaskId: s.activeDevinTaskId,
    runs: s.runs.map((r) => ({
      id: r.id,
      generation: r.generation,
      status: r.status,
      branch: r.branch,
      ticketId: r.ticketId,
      investigationId: r.investigationId,
      devinReproduceId: r.devinReproduceId,
      devinFixId: r.devinFixId,
      pullRequestUrl: r.pullRequestUrl,
      errorMessage: r.errorMessage,
      timeline: r.timeline as ScenarioData["runs"][number]["timeline"],
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Demo Lab</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Activate issues, run investigations, and test Devin AI with reproducible scenarios
        </p>
      </div>

      {/* Stats + Generate */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{scenarios.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Scenarios</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{activeCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalRuns}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Runs</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <GenerateScenarioDialog />
              <DefectAuthorWizard />
              <Badge variant="outline" className="text-xs">
                Demo Product: Trevorton27/support-buddy-demo-product
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scenarios grouped by service */}
      {Array.from(serviceGroups.entries()).map(([service, serviceScenarios]) => (
        <div key={service} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{service}</h2>
            <Badge variant="outline" className="text-xs">
              {serviceScenarios.length} scenario{serviceScenarios.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="space-y-3">
            {serviceScenarios.map((s) => (
              <ScenarioCard key={s.id} scenario={serializeScenario(s)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
