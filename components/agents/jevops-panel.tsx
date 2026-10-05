import Link from "next/link";
import { ExternalLink, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JevOpsDecision } from "@/lib/integrations/jevops/client";

interface JevOpsPanelProps {
  enabled: boolean;
  decisionId?: string;
  decision: JevOpsDecision | null;
  dashboardUrl?: string;
}

const dispositionColor: Record<string, string> = {
  allow:        "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800",
  retry:        "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800",
  human_review: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800",
  block:        "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800",
};

function DispositionBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${dispositionColor[value] ?? dispositionColor.retry}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function formatJudgmentValue(value: number | string): string {
  return typeof value === "number" ? value.toFixed(2) : value;
}

export function JevOpsPanel({ enabled, decisionId, decision, dashboardUrl }: JevOpsPanelProps) {
  const matchedRule = decision?.policy_trace?.matched_rule as string | null | undefined;
  const decisionLink = dashboardUrl && decisionId ? `${dashboardUrl.replace(/\/$/, "")}/decisions/${decisionId}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-500" />
          My name Jev: typesafe AI response
          {decision && <DispositionBadge value={decision.disposition} />}
          {decisionLink && (
            <a
              href={decisionLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open in JevOps <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled && !decisionId && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            JevOps is not enabled. Set <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">JEVOPS_API_URL</code>,{" "}
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">JEVOPS_API_KEY</code> and{" "}
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">JEVOPS_ENABLED=true</code> to evaluate replies.{" "}
            <Link href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">Settings →</Link>
          </p>
        )}

        {enabled && !decisionId && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No JevOps decision recorded for this run. It either ran before JevOps was enabled or the evaluation call failed (check the guardrails logs).
          </p>
        )}

        {decisionId && !decision && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Decision <span className="font-mono text-xs">{decisionId}</span> could not be loaded from the JevOps API.
          </p>
        )}

        {decision && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-slate-500 dark:text-slate-400">Action</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">{decision.action_type}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Matched rule</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">{matchedRule ?? "default"}</dd>
              {decision.final_disposition && (
                <>
                  <dt className="text-slate-500 dark:text-slate-400">Final disposition</dt>
                  <dd><DispositionBadge value={decision.final_disposition} /></dd>
                </>
              )}
              {decision.mode && (
                <>
                  <dt className="text-slate-500 dark:text-slate-400">Mode</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{decision.mode}{decision.environment ? ` · ${decision.environment}` : ""}</dd>
                </>
              )}
              {decision.provider_latency_ms != null && (
                <>
                  <dt className="text-slate-500 dark:text-slate-400">Provider</dt>
                  <dd className="text-slate-700 dark:text-slate-300 tabular-nums">
                    {decision.provider_model ?? "jev"} · {Math.round(decision.provider_latency_ms)}ms
                  </dd>
                </>
              )}
              <dt className="text-slate-500 dark:text-slate-400">Decision ID</dt>
              <dd className="font-mono text-slate-500 dark:text-slate-400 truncate">{decision.id}</dd>
            </dl>

            {decision.judgments.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Judgments</div>
                {decision.judgments.map((j) => (
                  <div
                    key={j.question_key}
                    className="flex items-center justify-between gap-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-slate-700 dark:text-slate-300">{j.question_key}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{j.question_type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums shrink-0">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatJudgmentValue(j.value)}</span>
                      {j.confidence != null && (
                        <span className="text-slate-500 dark:text-slate-400">{Math.round(j.confidence * 100)}% conf</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
