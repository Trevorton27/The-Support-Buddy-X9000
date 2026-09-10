"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bug, Check, Loader2, Play, RotateCcw, Ticket, Search,
  GitBranch, ExternalLink, ChevronDown, ChevronUp, Zap, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScenarioTimeline } from "./scenario-timeline";

export interface ScenarioData {
  id: string;
  key: string;
  title: string;
  description: string;
  service: string;
  severity: string;
  difficulty: string;
  category: string;
  status: string;
  generation: number;
  activeBranch: string | null;
  activeTicketId: string | null;
  activeDevinTaskId: string | null;
  runs: Array<{
    id: string;
    generation: number;
    status: string;
    branch: string | null;
    ticketId: string | null;
    investigationId: string | null;
    devinReproduceId: string | null;
    devinFixId: string | null;
    pullRequestUrl: string | null;
    errorMessage: string | null;
    timeline: Array<{ timestamp: string; event: string; detail?: string }> | null;
    createdAt: string;
    completedAt: string | null;
  }>;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: "Healthy", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
  activating: { label: "Activating", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
  broken: { label: "Broken", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
  ticket_open: { label: "Ticket Open", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" },
  investigating: { label: "Investigating", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" },
  awaiting_approval: { label: "Awaiting Approval", color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800" },
  devin_reproducing: { label: "Devin Reproducing", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  devin_fixing: { label: "Devin Fixing", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800" },
  pr_ready: { label: "PR Ready", color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800" },
  fixed: { label: "Fixed", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
  resetting: { label: "Resetting", color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-700" },
  failed: { label: "Failed", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" },
  completed: { label: "Completed", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" },
};

const severityBadge: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  low: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export function ScenarioCard({ scenario }: { scenario: ScenarioData }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mutating, setMutating] = useState(false);

  const status = statusConfig[scenario.status] ?? statusConfig.available;
  const latestRun = scenario.runs[0] ?? null;

  async function handleAction(action: string) {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/demo-lab/${scenario.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  const isIdle = scenario.status === "available" || scenario.status === "completed" || scenario.status === "failed";
  const isBusy = loading !== null || mutating;

  async function handleMutate() {
    setMutating(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "mutate",
          sourceTemplateKey: scenario.key,
          service: scenario.service,
          save: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Mutation failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className={`border rounded-xl p-5 space-y-4 transition-colors ${status.bg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{scenario.title}</h3>
            <Badge variant="outline" className={`text-xs ${severityBadge[scenario.severity] ?? ""}`}>
              {scenario.severity}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{scenario.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              {scenario.service}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{scenario.category}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{scenario.difficulty}</span>
            {scenario.generation > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Gen {scenario.generation}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.bg} ${status.color}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Context links */}
      {latestRun && (
        <div className="flex flex-wrap gap-3 text-xs">
          {latestRun.branch && (
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <GitBranch className="w-3 h-3" /> {latestRun.branch}
            </span>
          )}
          {latestRun.ticketId && (
            <a href={`/tickets/${latestRun.ticketId}`} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
              <Ticket className="w-3 h-3" /> View ticket
            </a>
          )}
          {latestRun.investigationId && (
            <a href={`/investigations/${latestRun.investigationId}`} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
              <Search className="w-3 h-3" /> View investigation
            </a>
          )}
          {latestRun.pullRequestUrl && (
            <a href={latestRun.pullRequestUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
              <ExternalLink className="w-3 h-3" /> View PR
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isIdle && (
          <>
            <Button size="sm" variant="outline" onClick={() => handleAction("activate")} disabled={isBusy}
              className="text-xs border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400">
              {loading === "activate" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Bug className="w-3 h-3 mr-1" />}
              Activate Issue
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleAction("run_full")} disabled={isBusy}
              className="text-xs border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-400">
              {loading === "run_full" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
              Run Entire Demo
            </Button>
            <Button size="sm" variant="outline" onClick={handleMutate} disabled={isBusy}
              className="text-xs border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-400">
              {mutating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
              Mutate
            </Button>
          </>
        )}

        {scenario.status === "broken" && (
          <Button size="sm" variant="outline" onClick={() => handleAction("create_ticket")} disabled={isBusy}
            className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400">
            {loading === "create_ticket" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Ticket className="w-3 h-3 mr-1" />}
            Create Ticket
          </Button>
        )}

        {scenario.status === "ticket_open" && (
          <Button size="sm" variant="outline" onClick={() => handleAction("investigate")} disabled={isBusy}
            className="text-xs border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400">
            {loading === "investigate" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
            Investigate
          </Button>
        )}

        {!isIdle && (
          <Button size="sm" variant="outline" onClick={() => handleAction("reset")} disabled={isBusy}
            className="text-xs border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400">
            {loading === "reset" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
            Reset
          </Button>
        )}

        {/* Expand timeline toggle */}
        {latestRun?.timeline && latestRun.timeline.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} className="text-xs ml-auto">
            {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
            Timeline
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Timeline */}
      {expanded && latestRun?.timeline && (
        <ScenarioTimeline entries={latestRun.timeline} />
      )}
    </div>
  );
}
