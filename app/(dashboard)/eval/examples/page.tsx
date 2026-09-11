import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import { FlaskConical, BookOpen } from "lucide-react";

export default async function EvalExamplesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const examples = await prisma.evalExample.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { evalResults: true } } },
  });

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Eval Examples</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {examples.length} example{examples.length !== 1 ? "s" : ""} in the test suite
            </p>
          </div>
        </div>
        <Link href="/eval" className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2">
          ← Eval runs
        </Link>
      </div>

      {examples.length === 0 ? (
        <Card className="p-8 text-center">
          <FlaskConical className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No eval examples yet. Run{" "}
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">
              npx tsx scripts/export-eval-data.ts
            </code>{" "}
            to bootstrap from approved investigations.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {examples.map((example) => {
            const keywords = (example.expectedEvidenceKeywords as string[]) ?? [];
            return (
              <Card key={example.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {example.ticketTitle}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0 capitalize">
                        {example.expectedSeverity}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                      {example.ticketDescription}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                      {example.sourceRunId && (
                        <span>
                          Source:{" "}
                          <Link
                            href={`/investigations/${example.sourceRunId}`}
                            className="text-blue-500 hover:underline"
                          >
                            investigation
                          </Link>
                        </span>
                      )}
                      {keywords.length > 0 && (
                        <span>{keywords.length} evidence keywords</span>
                      )}
                      <span>{example._count.evalResults} eval result{example._count.evalResults !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(example.createdAt)}</span>
                    </div>
                  </div>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {keywords.slice(0, 6).map((kw) => (
                      <span
                        key={kw}
                        className="text-xs px-2 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-full"
                      >
                        {kw}
                      </span>
                    ))}
                    {keywords.length > 6 && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">+{keywords.length - 6} more</span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
