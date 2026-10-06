import Link from "next/link";
import { ExternalLink, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JevOpsDecision, JevOpsError } from "@/lib/integrations/jevops/client";

interface JevOpsPanelProps {
  enabled: boolean;
  decisionId?: string;
  decision: JevOpsDecision | null;
  /** Why there is no decision: the evaluate call failed, or the decision could not be fetched */
  error?: JevOpsError | null;
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

/** Jev ran successfully only if a decision exists and the model itself didn't fail. */
function getFailure(
  enabled: boolean,
  decision: JevOpsDecision | null,
  error: JevOpsError | null | undefined
): JevOpsError | null {
  if (decision) {
    const providerError = decision.policy_trace?.error as string | undefined;
    return providerError ? { code: "JEV_PROVIDER_ERROR", message: providerError } : null;
  }
  if (error) return error;
  if (!enabled) {
    return { code: "NOT_CONFIGURED", message: "Set JEVOPS_API_URL, JEVOPS_API_KEY and JEVOPS_ENABLED=true" };
  }
  return {
    code: "NO_DECISION",
    message: "No JevOps decision was recorded for this run. It may have run before JevOps was enabled.",
  };
}

export function JevOpsPanel({ enabled, decisionId, decision, error, dashboardUrl }: JevOpsPanelProps) {
  const matchedRule = decision?.policy_trace?.matched_rule as string | null | undefined;
  const failure = getFailure(enabled, decision, error);
  const decisionLink = dashboardUrl && decisionId ? `${dashboardUrl.replace(/\/$/, "")}/decisions/${decisionId}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Scale className="w-4 h-4 text-slate-500" />
          <span>
            Typesafe AI response:{" "}
            {failure ? (
              <span className="text-red-600 dark:text-red-400">Jev Failed To Run</span>
            ) : (
              <span className="text-green-600 dark:text-green-400">My Name Jev</span>
            )}
          </span>
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
        {failure && (
          <div
            role="alert"
            className="text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 space-y-1"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-red-700 dark:text-red-300">Error code</span>
              <code className="font-mono text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 px-1.5 rounded">{failure.code}</code>
            </div>
            {failure.message && (
              <div className="font-mono text-red-600 dark:text-red-400 break-words">{failure.message}</div>
            )}
            {decision && (
              <div className="text-red-600 dark:text-red-400">JevOps fell back to {decision.disposition.replace(/_/g, " ")}.</div>
            )}
            {decisionId && !decision && (
              <div className="text-red-700 dark:text-red-300 font-medium">
                Jev&apos;s decision was saved but couldn&apos;t be loaded. This is usually temporary. Please reload the page to try again.
              </div>
            )}
            {failure.code === "NOT_CONFIGURED" && (
              <Link href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">Settings →</Link>
            )}
          </div>
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
