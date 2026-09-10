"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ExternalLink, Send, X, Loader2, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

// ─── Types ───

export interface DevinTaskRow {
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
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pollCount: number;
  ticketTitle: string | null;
  ticketId: string | null;
  ticketSeverity: string | null;
  investigationId: string | null;
  investigationStatus: string | null;
}

export interface DevinStats {
  total: number;
  active: number;
  finished: number;
  failed: number;
  reproduced: number;
  fixesSubmitted: number;
  avgPollCount: number;
}

// ─── Status Styling ───

const STATUS_STYLES: Record<string, { label: string; color: string; dot?: string }> = {
  queued: { label: "Queued", color: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400" },
  creating: { label: "Creating", color: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400" },
  working: { label: "Working", color: "text-blue-700 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-500" },
  blocked: { label: "Blocked", color: "text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300" },
  waiting: { label: "Waiting", color: "text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300" },
  pr_ready: { label: "PR Ready", color: "text-purple-700 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-300" },
  finished: { label: "Finished", color: "text-green-700 bg-green-100 dark:bg-green-900/40 dark:text-green-300" },
  failed: { label: "Failed", color: "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300" },
  expired: { label: "Expired", color: "text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300" },
  cancelled: { label: "Cancelled", color: "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400" },
};

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  reproduce: { label: "Reproduce", color: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" },
  fix: { label: "Fix", color: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" },
  defect_author: { label: "Author Defect", color: "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400" },
};

const VERDICT_COLORS: Record<string, string> = {
  REPRODUCED: "text-green-700 dark:text-green-400",
  FIX_SUBMITTED: "text-green-700 dark:text-green-400",
  DEFECT_CREATED: "text-green-700 dark:text-green-400",
  UNABLE_TO_REPRODUCE: "text-slate-600 dark:text-slate-400",
  FIX_FAILED: "text-red-700 dark:text-red-400",
  DEFECT_FAILED: "text-red-700 dark:text-red-400",
};

const ACTIVE_STATUSES = ["queued", "creating", "working", "blocked", "waiting", "pr_ready"];
type FilterMode = "all" | "active" | "reproduce" | "fix" | "defect_author" | "finished" | "failed";

// ─── Main Dashboard ───

export function DevinDashboard({
  tasks: initialTasks,
  stats,
}: {
  tasks: DevinTaskRow[];
  stats: DevinStats;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = initialTasks.filter((t) => {
    switch (filter) {
      case "active": return ACTIVE_STATUSES.includes(t.status);
      case "reproduce": return t.mode === "reproduce";
      case "fix": return t.mode === "fix";
      case "defect_author": return t.mode === "defect_author";
      case "finished": return t.status === "finished";
      case "failed": return ["failed", "expired"].includes(t.status);
      default: return true;
    }
  });

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Total Tasks" value={stats.total} />
        <StatCard label="Active" value={stats.active} color="text-blue-600 dark:text-blue-400" />
        <StatCard label="Finished" value={stats.finished} color="text-green-600 dark:text-green-400" />
        <StatCard label="Failed" value={stats.failed} color="text-red-600 dark:text-red-400" />
        <StatCard label="Reproduced" value={stats.reproduced} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Fixes Submitted" value={stats.fixesSubmitted} color="text-purple-600 dark:text-purple-400" />
        <StatCard label="Avg Polls" value={stats.avgPollCount} />
      </div>

      {/* Filters + Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        {(["all", "active", "reproduce", "fix", "defect_author", "finished", "failed"] as FilterMode[]).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="text-xs h-7"
          >
            {f === "all" ? "All" : f === "active" ? "Active" : f === "defect_author" ? "Author" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.refresh()}
          className="text-xs h-7 ml-auto"
        >
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
            No tasks match the current filter.
          </p>
        )}
        {filtered.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            expanded={expandedId === task.id}
            onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Stat Card ───

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
      <p className={`text-xl font-bold ${color ?? "text-slate-900 dark:text-slate-100"}`}>
        {typeof value === "number" && !Number.isInteger(value) ? value.toFixed(1) : value}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}

// ─── Task Row ───

function TaskRow({
  task,
  expanded,
  onToggle,
}: {
  task: DevinTaskRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  const statusStyle = STATUS_STYLES[task.status] ?? STATUS_STYLES.queued;
  const modeStyle = MODE_LABELS[task.mode] ?? MODE_LABELS.reproduce;
  const isActive = ACTIVE_STATUSES.includes(task.status);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/devin/tasks/${task.id}/cancel`, { method: "POST" });
      window.location.reload();
    } catch {
      setCancelling(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/devin/tasks/${task.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      setMessage("");
      setShowMessage(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`border rounded-lg bg-white dark:bg-slate-900 transition-colors ${
      isActive
        ? "border-blue-200 dark:border-blue-800"
        : "border-slate-200 dark:border-slate-700"
    }`}>
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <Bot className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-500" : "text-slate-400"}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${modeStyle.color}`}>
              {modeStyle.label}
            </Badge>
            <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle.color}`}>
              {statusStyle.dot && <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} animate-pulse mr-1`} />}
              {statusStyle.label}
            </span>
            {task.verdict && (
              <span className={`text-[10px] font-medium ${VERDICT_COLORS[task.verdict] ?? ""}`}>
                {task.verdict.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {task.ticketTitle ? (
              <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                {task.ticketTitle}
              </span>
            ) : (
              <span className="text-xs text-slate-400 italic">No linked ticket</span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[10px] text-slate-400">
            {formatRelativeTime(new Date(task.createdAt))}
          </p>
          {task.pollCount > 0 && (
            <p className="text-[10px] text-slate-400">
              {task.pollCount} polls
            </p>
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 space-y-2 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
            <div>
              <span className="text-slate-400">Repository:</span>{" "}
              <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">{task.repository}</span>
            </div>
            <div>
              <span className="text-slate-400">Task ID:</span>{" "}
              <span className="text-slate-700 dark:text-slate-300 font-mono text-[11px]">{task.id}</span>
            </div>
            {task.startedAt && (
              <div>
                <span className="text-slate-400">Started:</span>{" "}
                <span className="text-slate-700 dark:text-slate-300">{formatRelativeTime(new Date(task.startedAt))}</span>
              </div>
            )}
            {task.completedAt && (
              <div>
                <span className="text-slate-400">Completed:</span>{" "}
                <span className="text-slate-700 dark:text-slate-300">{formatRelativeTime(new Date(task.completedAt))}</span>
              </div>
            )}
            {task.investigationId && (
              <div>
                <span className="text-slate-400">Investigation:</span>{" "}
                <a href={`/investigations/${task.investigationId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  View →
                </a>
              </div>
            )}
            {task.ticketId && (
              <div>
                <span className="text-slate-400">Ticket:</span>{" "}
                <a href={`/tickets/${task.ticketId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  View →
                </a>
              </div>
            )}
          </div>

          {task.verdictReason && (
            <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded p-2 mt-1">
              {task.verdictReason}
            </div>
          )}

          {/* Action links */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            {task.sessionUrl && (
              <a
                href={task.sessionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Devin Session
              </a>
            )}
            {task.pullRequestUrl && (
              <a
                href={task.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Pull Request
              </a>
            )}

            {isActive && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={(e) => { e.stopPropagation(); setShowMessage(!showMessage); }}
                >
                  <Send className="w-3 h-3 mr-1" /> Message
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] text-red-600 hover:text-red-700"
                  onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                  disabled={cancelling}
                >
                  {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                  Cancel
                </Button>
              </>
            )}
          </div>

          {/* Message input */}
          {showMessage && isActive && (
            <div className="flex gap-1">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Send message to Devin..."
                className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800"
                onClick={(e) => e.stopPropagation()}
              />
              <Button size="sm" className="h-6 px-2" onClick={handleSendMessage} disabled={sending || !message.trim()}>
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
