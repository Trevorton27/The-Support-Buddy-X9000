import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReplyEditor } from "@/components/approvals/reply-editor";
import { GuardrailsBadge } from "@/components/agents/guardrails-badge";
import { HypothesisCard } from "@/components/agents/hypothesis-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import type { Hypothesis, GuardrailsResult } from "@/agents/state";

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { runId } = await params;

  const run = await prisma.investigationRun.findUnique({
    where: { id: runId },
    include: {
      ticket: { include: { customer: true } },
      steps: { orderBy: { startedAt: "asc" } },
    },
  });

  if (!run) notFound();
  if (run.approvalStatus !== "pending") {
    redirect(`/investigations/${runId}`);
  }

  const hypotheses = (run.hypotheses as unknown as Hypothesis[]) ?? [];
  const guardrailsResult = run.guardrailsResult as unknown as GuardrailsResult | null;

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-sm text-slate-500">
        <Link href="/approvals" className="hover:text-slate-900 dark:hover:text-slate-100">Approval Queue</Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-xs">{run.id.slice(0, 8)}...</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-start gap-3 mb-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex-1">{run.ticket.title}</h1>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 shrink-0">
            Awaiting Approval
          </Badge>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {run.ticket.customer.company} · {run.ticket.customer.plan} plan · started {formatRelativeTime(run.startedAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Draft + Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Guardrails flags */}
          {guardrailsResult && (
            <Card className={!guardrailsResult.passed ? "border-red-200 dark:border-red-800" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Guardrails Review
                  <GuardrailsBadge result={guardrailsResult} compact />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GuardrailsBadge result={guardrailsResult} />
              </CardContent>
            </Card>
          )}

          {/* Reply editor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review & Edit Draft Reply</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Edits are tracked in the audit trail. Approve to send, Reject to discard.
              </p>
            </CardHeader>
            <CardContent>
              <ReplyEditor runId={run.id} originalDraft={run.summary ?? ""} />
            </CardContent>
          </Card>
        </div>

        {/* Right: Evidence */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Root Cause Hypotheses</h2>
          {hypotheses.slice(0, 3).map((h, i) => (
            <HypothesisCard key={h.id || i} hypothesis={h} rank={i + 1} />
          ))}

          {/* Original ticket */}
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Original Ticket</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                {run.ticket.description}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
