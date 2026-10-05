"use client";

import { useState } from "react";
import { ExternalLink, GitMerge, GitPullRequestClosed, Loader2, Scale, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  JUDGMENT_LABELS,
  MAX_JEV_FEEDBACK_ROUNDS,
  type DevinJevJudgment,
  type DevinJevReview,
} from "@/lib/integrations/jevops/devin-review-shared";

interface DevinJevReviewProps {
  taskId: string;
  review: DevinJevReview;
  feedbackRounds: number;
  taskStatus: string;
  pullRequestUrl: string | null;
}

const dispositionColor: Record<string, string> = {
  allow:        "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800",
  retry:        "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800",
  human_review: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800",
  block:        "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800",
};

const dispositionLabel: Record<string, string> = {
  allow: "Ready to merge",
  retry: "Send back to Devin",
  human_review: "Needs engineer review",
  block: "Do not merge",
};

const TERMINAL = ["finished", "failed", "expired", "cancelled"];

function DispositionBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${dispositionColor[value] ?? dispositionColor.retry}`}>
      {dispositionLabel[value] ?? value.replace(/_/g, " ")}
    </span>
  );
}

function JudgmentRow({ judgment }: { judgment: DevinJevJudgment }) {
  const label = JUDGMENT_LABELS[judgment.question_key] ?? judgment.question_key;
  const numeric = typeof judgment.value === "number";
  // Bar fill: 0–1 scores as-is, risk inverted so a full bar is always "good"
  const fill =
    judgment.question_type === "noul" && numeric ? (judgment.value as number)
    : judgment.question_type === "score" && numeric ? 1 - ((judgment.value as number) - 1) / 9
    : null;
  const shown =
    judgment.question_type === "noul" && numeric ? (judgment.value as number).toFixed(2)
    : judgment.question_type === "score" && numeric ? `${(judgment.value as number).toFixed(1)}/10`
    : String(judgment.value).replace(/_/g, " ");

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-28 shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      {fill !== null ? (
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${fill >= 0.6 ? "bg-green-500" : fill >= 0.4 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <span className="w-20 shrink-0 text-right tabular-nums font-medium text-slate-800 dark:text-slate-200">{shown}</span>
      <span className="w-14 shrink-0 text-right tabular-nums text-slate-400">
        {judgment.confidence != null ? `${Math.round(judgment.confidence * 100)}%` : ""}
      </span>
    </div>
  );
}

export function DevinJevReviewCard({ taskId, review, feedbackRounds, taskStatus, pullRequestUrl }: DevinJevReviewProps) {
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL.includes(taskStatus);
  const awaitingRereview = feedbackRounds > review.round;
  const roundsLeft = MAX_JEV_FEEDBACK_ROUNDS - feedbackRounds;
  const canSendBack = isTerminal && !awaitingRereview && roundsLeft > 0 && review.disposition !== "allow" && !review.outcome;

  const handleSendBack = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/devin/tasks/${taskId}/jev-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Failed to send feedback");
        setSending(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Failed to send feedback");
      setSending(false);
    }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-3 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 flex-wrap">
        <Scale className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Jev review of Devin output</span>
        <DispositionBadge value={review.disposition} />
        {review.round > 0 && <span className="text-[10px] text-slate-400">Round {review.round + 1}</span>}
        {review.outcome && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            {review.outcome.merged ? <GitMerge className="w-3 h-3 text-purple-500" /> : <GitPullRequestClosed className="w-3 h-3 text-red-500" />}
            PR #{review.outcome.prNumber} {review.outcome.merged ? "merged" : "closed"} · outcome sent to JevOps
          </span>
        )}
      </div>

      {awaitingRereview && (
        <p className="text-xs text-blue-600 dark:text-blue-400">
          Sent back to Devin. Jev will re-review when Devin finishes.
        </p>
      )}

      {review.providerError && (
        <div className="text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 text-amber-700 dark:text-amber-300">
          Jev model unavailable, fell back to human review: <span className="font-mono">{review.providerError}</span>
        </div>
      )}

      {review.overrides.length > 0 && (
        <div className="text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 space-y-0.5">
          <div className="font-medium text-red-700 dark:text-red-300">
            Policy escalated Jev&apos;s &ldquo;{review.jevDisposition.replace(/_/g, " ")}&rdquo;
          </div>
          {review.overrides.map((o, i) => (
            <div key={i} className="text-red-600 dark:text-red-400">{o}</div>
          ))}
        </div>
      )}

      {review.judgments.length > 0 && (
        <div className="space-y-1.5">
          {review.judgments.map((j) => (
            <JudgmentRow key={j.question_key} judgment={j} />
          ))}
        </div>
      )}

      {canSendBack && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for Devin..."
          className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={sending}
        />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {pullRequestUrl && (
          <a
            href={pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Open PR
          </a>
        )}
        {canSendBack && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={handleSendBack} disabled={sending}>
            {sending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Undo2 className="w-3 h-3 mr-1" />}
            Send back to Devin
          </Button>
        )}
        {isTerminal && !awaitingRereview && roundsLeft <= 0 && review.disposition !== "allow" && (
          <span className="text-[10px] text-slate-400">Feedback limit reached. Review the PR manually.</span>
        )}
        {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
