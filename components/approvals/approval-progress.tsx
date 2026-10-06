"use client";

import { useEffect, useState } from "react";
import { Check, Circle, CircleDot, X, ArrowRight, Minus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import type { ApprovalProgress as Progress, ProgressStage, StageState } from "@/lib/approval-progress";

const POLL_INTERVAL = 5000;

const STATE_STYLE: Record<StageState, { icon: React.ReactNode; dot: string; text: string }> = {
  done:    { icon: <Check className="w-3 h-3" />,                    dot: "bg-green-500 text-white",                         text: "text-slate-800 dark:text-slate-200" },
  active:  { icon: <Loader2 className="w-3 h-3 animate-spin" />,      dot: "bg-blue-500 text-white",                          text: "text-blue-700 dark:text-blue-300 font-medium" },
  action:  { icon: <CircleDot className="w-3 h-3" />,                dot: "bg-amber-500 text-white",                         text: "text-amber-700 dark:text-amber-300 font-medium" },
  pending: { icon: <Circle className="w-3 h-3" />,                   dot: "bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600", text: "text-slate-400 dark:text-slate-500" },
  failed:  { icon: <X className="w-3 h-3" />,                        dot: "bg-red-500 text-white",                           text: "text-red-700 dark:text-red-300" },
  skipped: { icon: <Minus className="w-3 h-3" />,                    dot: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400", text: "text-slate-500 dark:text-slate-400 line-through decoration-slate-300" },
};

function StageRow({ stage, last }: { stage: ProgressStage; last: boolean }) {
  const style = STATE_STYLE[stage.state];
  const external = stage.href?.startsWith("http");
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span className="absolute left-[9px] top-5 bottom-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden />}
      <span className={`relative z-10 flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${style.dot}`}>{style.icon}</span>
      <div className="min-w-0 flex-1 -mt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm ${style.text}`}>{stage.label}</span>
          {stage.at && <span className="text-[11px] text-slate-400">{formatRelativeTime(new Date(stage.at))}</span>}
          {stage.href && stage.hrefLabel && (
            <a
              href={stage.href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {stage.hrefLabel} <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>
        {stage.detail && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">{stage.detail}</p>}
      </div>
    </li>
  );
}

export function ApprovalProgressTracker({ runId, initial }: { runId: string; initial: Progress }) {
  const [progress, setProgress] = useState(initial);

  useEffect(() => {
    if (!progress.active) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/investigations/${runId}/progress`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { progress: Progress | null };
          if (data.progress) setProgress(data.progress);
        }
      } catch {
        /* keep the last known state; retry on the next tick */
        setProgress((p) => ({ ...p }));
      }
    }, POLL_INTERVAL);
    return () => clearTimeout(timer);
  }, [runId, progress]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          What happens next
          {progress.active && (
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-blue-600 dark:text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Live
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol aria-label="Approval progress">
          {progress.stages.map((stage, i) => (
            <StageRow key={stage.key} stage={stage} last={i === progress.stages.length - 1} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
