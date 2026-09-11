import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listTemplates, getActiveBugs, getDemoRepoPath } from "@/lib/bug-generator/generator";
import { BugTemplateCard } from "@/components/bug-generator/bug-template-card";

export default async function BugGeneratorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const repoPath = getDemoRepoPath();
  const templateGroups = listTemplates();
  const activeBugs = getActiveBugs();
  const activeIds = new Set(activeBugs.map((b) => b.templateId));

  const totalTemplates = templateGroups.reduce((sum, g) => sum + g.templates.length, 0);

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Bug Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Inject reproducible bugs into the demo product repo for Devin AI testing
        </p>
      </div>

      {/* Repo status */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Demo Product Repository</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {repoPath ?? "Not found"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={repoPath ? "default" : "destructive"}>
                {repoPath ? "Connected" : "Not Found"}
              </Badge>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">{totalTemplates} templates</p>
                <p className="text-xs text-red-600 dark:text-red-400">{activeBugs.length} active</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!repoPath && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Demo product repo not found. Expected at <code className="text-xs bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded">../support-buddy-demo-product</code> or set <code className="text-xs bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded">DEMO_PRODUCT_REPO_PATH</code> in your environment.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Template groups by service */}
      {templateGroups.map((group) => (
        <Card key={group.service}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {group.service}
              <Badge variant="outline" className="text-xs">
                {group.templates.length} bug{group.templates.length !== 1 ? "s" : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.templates.map((t) => (
              <BugTemplateCard
                key={t.id}
                id={t.id}
                title={t.title}
                service={group.service}
                severity={t.severity}
                difficulty={t.difficulty}
                category={t.category}
                isActive={activeIds.has(t.id)}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
