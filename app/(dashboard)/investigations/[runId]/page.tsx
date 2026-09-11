import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AgentTimeline } from "@/components/agents/agent-timeline";
import { HypothesisCard } from "@/components/agents/hypothesis-card";
import { GuardrailsBadge } from "@/components/agents/guardrails-badge";
import { PipelineTimingBar } from "@/components/agents/pipeline-timing-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime, formatDuration } from "@/lib/utils";
import Link from "next/link";
import type { Hypothesis, GuardrailsResult } from "@/agents/state";
import { ReproduceButton } from "@/components/devin/reproduce-button";
import { FixButton } from "@/components/devin/fix-button";
import { DevinTasksSection } from "@/components/devin/devin-tasks-section";
import type { SerializedDevinTask } from "@/components/devin/devin-task-card";
import { InvestigationActions } from "@/components/agents/investigation-actions";

async function getRun(runId: string) {
  return prisma.investigationRun.findUnique({
    where: { id: runId },
    include: {
      ticket: { include: { customer: true } },
      steps: { orderBy: { startedAt: "asc" } },
      devinTasks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, mode: true, status: true, verdict: true, verdictReason: true,
          pullRequestUrl: true, repository: true, devinSessionId: true, sessionUrl: true,
          startedAt: true, updatedAt: true, ticketId: true, investigationRunId: true,
        },
      },
    },
  });
}

const statusColor: Record<string, string> = {
  complete:          "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800",
  running:           "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800",
  pending:           "text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700",
  failed:            "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800",
  awaiting_approval: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800",
  paused:            "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800",
  cancelled:         "text-slate-500 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700",
};

export default async function InvestigationRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) notFound();

  const duration = run.completedAt
    ? run.completedAt.getTime() - run.startedAt.getTime()
    : null;

  const hypotheses = (run.hypotheses as unknown as Hypothesis[]) ?? [];
  const guardrailsResult = run.guardrailsResult as unknown as GuardrailsResult | null;

  // Effective reply: human-edited takes precedence over AI draft
  const effectiveReply = run.editedReply || run.summary;

  const TERMINAL_DEVIN = ["finished", "failed", "expired", "cancelled"];
  const hasActiveReproduction = run.devinTasks.some(
    (t) => t.mode === "reproduce" && !TERMINAL_DEVIN.includes(t.status)
  );
  const hasActiveFix = run.devinTasks.some(
    (t) => t.mode === "fix" && !TERMINAL_DEVIN.includes(t.status)
  );
  const serializedDevinTasks: SerializedDevinTask[] = run.devinTasks.map((t) => ({
    ...t,
    startedAt: t.startedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="text-sm text-slate-500">
        <Link href="/investigations" className="hover:text-slate-900 dark:hover:text-slate-100">Investigations</Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-xs">{run.id.slice(0, 8)}...</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{run.ticket.title}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{run.ticket.customer.company}</span>
            <span>•</span>
            <span>{run.ticket.customer.plan} plan</span>
            <span>•</span>
            <span>{formatRelativeTime(run.startedAt)}</span>
            {duration && <span>• {formatDuration(duration)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${statusColor[run.status] ?? statusColor.pending}`}>
            {run.status.replace(/_/g, " ")}
          </span>
          <InvestigationActions runId={run.id} status={run.status} />
          {run.approvalStatus === "pending" && (
            <Link
              href={`/approvals/${run.id}`}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
            >
              Pending approval →
            </Link>
          )}
        </div>
      </div>

      {/* Phase 1: Pipeline Timing Bar */}
      {run.status === "complete" && run.steps.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <PipelineTimingBar steps={run.steps} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Agent Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <AgentTimeline steps={run.steps} runId={run.id} runStatus={run.status} />

          {/* Phase 2: Guardrails result */}
          {guardrailsResult && (
            <Card className={guardrailsResult.passed ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-3">
                  Guardrails
                  <GuardrailsBadge result={guardrailsResult} compact />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GuardrailsBadge result={guardrailsResult} />
              </CardContent>
            </Card>
          )}

          {/* Customer Draft Reply */}
          {effectiveReply && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {run.editedReply ? "Approved Customer Reply" : "Drafted Customer Reply"}
                  {run.editedReply && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Human edited</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {effectiveReply}
                </div>
                {run.reviewerNote && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium">Reviewer note:</span> {run.reviewerNote}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Escalation Note */}
          {run.escalationNote && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  Internal Escalation Note
                  <Badge variant="outline" className="text-xs">Engineering</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 rounded-lg p-4 overflow-auto max-h-64 whitespace-pre-wrap">
                  {run.escalationNote}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Devin AI Actions */}
          {(run.status === "complete" || run.status === "awaiting_approval" || serializedDevinTasks.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Devin AI</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(run.status === "complete" || run.status === "awaiting_approval") && (
                  <div className="flex flex-wrap gap-2">
                    <ReproduceButton
                      ticketId={run.ticketId}
                      investigationRunId={run.id}
                      hasActiveTask={hasActiveReproduction}
                    />
                    {run.approvalStatus === "approved" && (
                      <FixButton
                        investigationRunId={run.id}
                        ticketId={run.ticketId}
                        hasActiveTask={hasActiveFix}
                      />
                    )}
                  </div>
                )}
                <DevinTasksSection tasks={serializedDevinTasks} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Hypotheses */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Root Cause Hypotheses</h2>
          {hypotheses.length === 0 && run.status !== "complete" && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {run.status === "running" ? "Analysis in progress..." : "No hypotheses yet."}
            </p>
          )}
          {hypotheses.map((h, i) => (
            <HypothesisCard key={h.id || i} hypothesis={h} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
