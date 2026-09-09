"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Clock, GitBranch } from "lucide-react";
import { AgentOutputCard } from "./agent-output-card";
import { StepDetailDrawer } from "./step-detail-drawer";
import { TokenUsageBadge } from "./token-usage-badge";
import { formatDuration } from "@/lib/utils";
import type { TokenUsage } from "@/lib/agent-utils";
import type { AgentStep } from "@prisma/client";

// Canonical ordered pipeline with parallel group marker
const PIPELINE = [
  { name: "intake",                 label: "Ticket Classification",   parallel: false },
  { name: "customer-context",       label: "Customer Context",         parallel: false },
  { name: "log-analysis",           label: "Log Analysis",             parallel: true  },
  { name: "knowledge-retrieval",    label: "Knowledge Retrieval",      parallel: true  },
  { name: "incident-correlation",   label: "Incident Correlation",     parallel: true  },
  { name: "deployment-correlation", label: "Deployment Correlation",   parallel: true  },
  { name: "root-cause",             label: "Root Cause Analysis",      parallel: false },
  { name: "response-drafting",      label: "Response Drafting",        parallel: false },
  { name: "guardrails",             label: "Guardrails Check",         parallel: false }, // Phase 2
  { name: "escalation",             label: "Escalation Note",          parallel: false },
] as const;

const MODEL_FOR_AGENT: Record<string, string> = {
  intake: "gpt-4o-mini",
  "log-analysis": "gpt-4o-mini",
  "knowledge-retrieval": "gpt-4o-mini",
  guardrails: "gpt-4o-mini",
  "root-cause": "gpt-4o",
  "response-drafting": "gpt-4o",
  escalation: "gpt-4o",
};

function StepIcon({ status }: { status: string }) {
  if (status === "complete") return <Check className="w-3.5 h-3.5 text-green-600" />;
  if (status === "failed")   return <X className="w-3.5 h-3.5 text-red-600" />;
  if (status === "running")  return <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />;
  return <Clock className="w-3.5 h-3.5 text-slate-300" />;
}

const stepBg: Record<string, string> = {
  complete: "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800",
  failed:   "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800",
  running:  "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800",
  pending:  "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700",
};

function ElapsedTimer({ startedAt }: { startedAt: Date | string }) {
  const start = new Date(startedAt).getTime();
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - start) / 1000));
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [start]);
  return <span className="text-xs text-blue-500 tabular-nums">{elapsed}s</span>;
}

const severityColor: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  high:     "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  medium:   "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  low:      "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

function StepSummary({ agentName, output }: { agentName: string; output: unknown }) {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  if (agentName === "intake") {
    const severity = typeof o.severity === "string" ? o.severity : undefined;
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {severity && (
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${severityColor[severity] ?? severityColor.low}`}>
              {severity}
            </span>
          )}
          {typeof o.category === "string" && (
            <span className="inline-flex px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full border border-slate-200 dark:border-slate-700">
              {o.category}
            </span>
          )}
          {typeof o.affectedProduct === "string" && (
            <span className="inline-flex px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
              {o.affectedProduct}
            </span>
          )}
        </div>
        {typeof o.summary === "string" && (
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{o.summary}</p>
        )}
      </div>
    );
  }

  if (agentName === "customer-context") {
    const customer = o.customer && typeof o.customer === "object" ? (o.customer as Record<string, unknown>) : null;
    const deployCount = Array.isArray(o.recentDeployments) ? o.recentDeployments.length : 0;
    if (!customer) return null;
    return (
      <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md space-y-0.5">
        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{customer.name as string} · {customer.company as string}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{customer.plan as string} plan · {customer.region as string} · {customer.industry as string}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{deployCount} recent deployment{deployCount !== 1 ? "s" : ""} on record</div>
      </div>
    );
  }

  if (agentName === "log-analysis") {
    const rawPatterns = Array.isArray(o.errorPatterns) ? o.errorPatterns : [];
    const rawAnomalies = Array.isArray(o.anomalies) ? o.anomalies : [];
    const extractLabel = (item: unknown): string => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") { const r = item as Record<string, unknown>; return typeof r.pattern === "string" ? r.pattern : JSON.stringify(item); }
      return "";
    };
    const topSignal = extractLabel(rawPatterns[0] ?? rawAnomalies[0]);
    return (
      <div className="mt-2 space-y-1.5">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {typeof o.logCount === "number" ? o.logCount : "—"} logs · {typeof o.traceCount === "number" ? o.traceCount : "—"} traces analyzed
          {typeof o.datadogCount === "number" && o.datadogCount > 0 && ` · ${o.datadogCount} Datadog`}
        </div>
        {topSignal && (
          <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded px-2 py-1 leading-relaxed">
            {topSignal}
          </div>
        )}
      </div>
    );
  }

  if (agentName === "knowledge-retrieval") {
    const sources = Array.isArray(o.sources) ? (o.sources as string[]) : [];
    const uniqueDocs = [...new Set(sources.map((s) => s.split("/").pop() ?? s))];
    const topRerank = typeof o.topRerankScore === "number" ? o.topRerankScore : null;
    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {typeof o.chunksRetrieved === "number" ? o.chunksRetrieved : "—"} chunks from {uniqueDocs.length} doc{uniqueDocs.length !== 1 ? "s" : ""}
          {topRerank !== null && <span className="ml-1 text-green-600 dark:text-green-400">[top rerank: {topRerank.toFixed(2)}]</span>}
        </div>
        {uniqueDocs.slice(0, 3).map((doc) => (
          <div key={doc} className="text-xs text-slate-600 dark:text-slate-400">· {doc}</div>
        ))}
      </div>
    );
  }

  if (agentName === "incident-correlation") {
    const incidents = Array.isArray(o.incidents) ? (o.incidents as Array<Record<string, unknown>>) : [];
    const sentryIssues = Array.isArray(o.sentryIssues) ? o.sentryIssues.length : 0;
    const count = typeof o.incidentsFound === "number" ? o.incidentsFound : incidents.length;
    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {count} related incident{count !== 1 ? "s" : ""} found
          {sentryIssues > 0 && ` · ${sentryIssues} Sentry issue${sentryIssues !== 1 ? "s" : ""}`}
        </div>
        {incidents.slice(0, 2).map((inc, i) => (
          <div key={i} className="text-xs text-slate-700 dark:text-slate-300">· {inc.title as string}</div>
        ))}
      </div>
    );
  }

  if (agentName === "deployment-correlation") {
    const deployments = Array.isArray(o.deployments) ? (o.deployments as Array<Record<string, unknown>>) : [];
    const count = typeof o.relevantDeployments === "number" ? o.relevantDeployments : deployments.length;
    return (
      <div className="mt-2 space-y-1">
        <div className="text-xs text-slate-500 dark:text-slate-400">{count} deployment{count !== 1 ? "s" : ""} in ±48h window</div>
        {deployments.slice(0, 2).map((d, i) => (
          <div key={i} className="text-xs text-slate-700 dark:text-slate-300">· {d.service as string} {d.version as string}</div>
        ))}
      </div>
    );
  }

  if (agentName === "root-cause") {
    const hypotheses = Array.isArray(o.hypotheses) ? (o.hypotheses as Array<Record<string, unknown>>) : [];
    const top = hypotheses[0];
    if (!top) return null;
    const confidence = typeof top.confidence === "number" ? top.confidence : 0;
    return (
      <div className="mt-2 space-y-1.5">
        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{top.title as string}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${confidence}%` }} />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{confidence}%</span>
        </div>
        {hypotheses.length > 1 && <div className="text-xs text-slate-400 dark:text-slate-500">+{hypotheses.length - 1} more hypothesis</div>}
      </div>
    );
  }

  if (agentName === "response-drafting") {
    const subject = typeof o.subject === "string" ? o.subject : undefined;
    const body = typeof o.body === "string" ? o.body : undefined;
    return (
      <div className="mt-2 space-y-1">
        {subject && <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Re: {subject}</div>}
        {body && <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">{body}</p>}
      </div>
    );
  }

  if (agentName === "guardrails") {
    const passed = typeof o.passed === "boolean" ? o.passed : true;
    const flags = Array.isArray(o.flags) ? o.flags : [];
    const blockCount = flags.filter((f) => (f as Record<string, unknown>).severity === "block").length;
    const warnCount = flags.filter((f) => (f as Record<string, unknown>).severity === "warn").length;
    return (
      <div className="mt-2">
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${
          passed ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
                 : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
        }`}>
          {passed ? "Passed" : `${blockCount} block · ${warnCount} warn`}
        </span>
      </div>
    );
  }

  if (agentName === "escalation") {
    const priority = typeof o.priority === "string" ? o.priority : undefined;
    const summary = typeof o.summary === "string" ? o.summary : undefined;
    const externalUrl = typeof o.externalUrl === "string" ? o.externalUrl : undefined;
    return (
      <div className="mt-2 space-y-1.5">
        {priority && (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-full">
            {priority}
          </span>
        )}
        {summary && <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">{summary}</p>}
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block truncate">
            {externalUrl}
          </a>
        )}
      </div>
    );
  }

  return null;
}

interface AgentTimelineProps {
  steps: AgentStep[];
  runId: string;
  runStatus: string;
}

export function AgentTimeline({ steps, runId, runStatus }: AgentTimelineProps) {
  const router = useRouter();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedStep, setSelectedStep] = useState<AgentStep | null>(null);

  useEffect(() => {
    if (runStatus !== "running" && runStatus !== "pending") return;
    intervalRef.current = setInterval(() => router.refresh(), 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runStatus, router]);

  const stepMap = new Map(steps.map((s) => [s.agentName, s]));
  const isActive = runStatus === "running" || runStatus === "pending";
  const isPausedOrCancelled = runStatus === "paused" || runStatus === "cancelled";
  let parallelGroupOpen = false;

  return (
    <>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Agent Pipeline</h2>

        {PIPELINE.map(({ name, label, parallel }, index) => {
          const step = stepMap.get(name) ?? null;
          const status = step?.status ?? "pending";
          const isGhost = step === null;
          const isLast = index === PIPELINE.length - 1;

          const showParallelStart = parallel && !parallelGroupOpen;
          if (parallel) parallelGroupOpen = true;
          const showParallelEnd = !parallel && parallelGroupOpen;
          if (showParallelEnd) parallelGroupOpen = false;

          return (
            <div key={name}>
              {showParallelStart && (
                <div className="flex items-center gap-2 py-1 pl-10 text-xs text-slate-400">
                  <GitBranch className="w-3 h-3" />
                  Running in parallel
                </div>
              )}

              <div
                className={`flex gap-3 ${step && status === "complete" ? "cursor-pointer group" : ""}`}
                onClick={() => step && status === "complete" && setSelectedStep(step)}
              >
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isGhost ? "bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700"
                            : (stepBg[status] ?? stepBg.pending)
                  }`}>
                    <StepIcon status={status} />
                  </div>
                  {!isLast && (
                    <div className={`w-px flex-1 my-1 ${status === "complete" ? "bg-green-200 dark:bg-green-800" : "bg-slate-100 dark:bg-slate-700"}`} />
                  )}
                </div>

                {/* Step content */}
                <div className={`flex-1 pb-4 ${isGhost ? "opacity-40" : ""} ${step && status === "complete" ? "group-hover:opacity-80" : ""}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm font-medium ${isGhost ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                      {label}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {step?.durationMs && <span>{formatDuration(step.durationMs)}</span>}
                      {/* Phase 1: Token usage badge */}
                      {step?.tokenUsage && status === "complete" && (
                        <TokenUsageBadge
                          tokenUsage={step.tokenUsage as unknown as TokenUsage}
                          model={MODEL_FOR_AGENT[name] ?? "gpt-4o-mini"}
                        />
                      )}
                      {status === "running" && step?.startedAt && <ElapsedTimer startedAt={step.startedAt} />}
                      {status === "failed" && <span className="text-red-500">Failed</span>}
                      {isGhost && isActive && <span className="text-slate-400">Queued</span>}
                      {isGhost && isPausedOrCancelled && <span className="text-slate-400">{runStatus === "paused" ? "Paused" : "Cancelled"}</span>}
                      {step && status === "complete" && (
                        <span className="text-xs text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors">View details →</span>
                      )}
                    </div>
                  </div>

                  {step?.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded px-2 py-1 mb-2">
                      {step.errorMessage}
                    </p>
                  )}

                  {step?.output && status === "complete" && (
                    <StepSummary agentName={name} output={step.output} />
                  )}

                  {step?.output && status === "complete" && (
                    <div className="mt-2">
                      <AgentOutputCard title="Raw output" output={step.output} defaultOpen={false} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Phase 1: Step detail drawer */}
      <StepDetailDrawer
        step={selectedStep}
        runId={runId}
        onClose={() => setSelectedStep(null)}
      />
    </>
  );
}
