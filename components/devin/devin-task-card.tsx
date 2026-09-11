"use client";

import { useState } from "react";
import { Bot, ExternalLink, X, Loader2, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import { DevinChat } from "./devin-chat";

export interface SerializedDevinTask {
  id: string;
  mode: string;
  status: string;
  verdict: string | null;
  verdictReason: string | null;
  pullRequestUrl: string | null;
  repository: string;
  devinSessionId: string | null;
  sessionUrl: string | null;
  startedAt: string | null;
  updatedAt: string;
  ticketId?: string | null;
  investigationRunId?: string | null;
}

const STATUS_STYLES: Record<string, { color: string; animate?: boolean; label?: string }> = {
  queued: { color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  creating: { color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  working: { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", animate: true },
  blocked: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", label: "waiting" },
  waiting: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", label: "waiting" },
  pr_ready: { color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  finished: { color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  failed: { color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  expired: { color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  cancelled: { color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

const VERDICT_COLORS: Record<string, string> = {
  REPRODUCED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  FIX_SUBMITTED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  UNABLE_TO_REPRODUCE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  CONFIGURATION_ISSUE: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PRODUCT_DEFECT: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  DOCUMENTATION_DEFECT: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  ADDITIONAL_INFORMATION_REQUIRED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  FIX_FAILED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const TERMINAL = ["finished", "failed", "expired", "cancelled"];

export function DevinTaskCard({ task }: { task: SerializedDevinTask }) {
  const [cancelling, setCancelling] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [verdictExpanded, setVerdictExpanded] = useState(false);

  const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.queued;
  const isTerminal = TERMINAL.includes(task.status);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/devin/tasks/${task.id}/cancel`, { method: "POST" });
      window.location.reload();
    } catch {
      setCancelling(false);
    }
  };

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-2 flex-wrap">
        <Bot className="w-4 h-4 text-slate-500" />
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {task.mode === "reproduce" ? "Reproduce" : "Fix"}
        </Badge>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusStyle.color}`}>
          {statusStyle.animate && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />}
          {statusStyle.label ?? task.status}
        </Badge>
        {task.startedAt && (
          <span className="text-[10px] text-slate-400">
            Started {formatRelativeTime(new Date(task.startedAt))}
          </span>
        )}
      </div>

      {task.verdict && (
        <div>
          <Badge variant="outline" className={`text-xs px-2 py-0.5 ${VERDICT_COLORS[task.verdict] ?? ""}`}>
            {task.verdict.replace(/_/g, " ")}
          </Badge>
          {task.verdictReason && (
            <button
              onClick={() => setVerdictExpanded(!verdictExpanded)}
              className="ml-2 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {verdictExpanded ? "Hide reason" : "Show reason"}
            </button>
          )}
          {verdictExpanded && task.verdictReason && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{task.verdictReason}</p>
          )}
        </div>
      )}

      {task.pullRequestUrl && (
        <a
          href={task.pullRequestUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Pull Request
        </a>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{task.repository}</span>

        {task.sessionUrl && (
          <a
            href={task.sessionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Chat On Devin
          </a>
        )}

        <Button
          size="sm"
          variant={showChat ? "default" : "outline"}
          className="h-5 px-2 text-[10px]"
          onClick={() => setShowChat(!showChat)}
        >
          <MessageCircle className="w-3 h-3 mr-1" />
          {showChat ? "Hide chat" : "Chat"}
        </Button>

        {!isTerminal && (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] text-red-600 hover:text-red-700"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          </Button>
        )}
      </div>

      {showChat && (
        <DevinChat
          taskId={task.id}
          taskStatus={task.status}
          sessionUrl={task.sessionUrl}
        />
      )}
    </div>
  );
}
