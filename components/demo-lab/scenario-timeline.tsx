"use client";

import { formatRelativeTime } from "@/lib/utils";

interface TimelineEntry {
  timestamp: string;
  event: string;
  detail?: string;
}

const eventLabels: Record<string, string> = {
  run_created: "Run created",
  status_activating: "Activating",
  status_broken: "Defect injected",
  status_ticket_open: "Ticket created",
  status_investigating: "Investigation started",
  status_awaiting_approval: "Awaiting approval",
  status_devin_reproducing: "Devin reproducing",
  status_devin_fixing: "Devin fixing",
  status_pr_ready: "PR ready",
  status_fixed: "Fixed",
  status_resetting: "Resetting",
  status_completed: "Completed",
  status_failed: "Failed",
};

const eventDot: Record<string, string> = {
  status_broken: "bg-red-500",
  status_fixed: "bg-green-500",
  status_completed: "bg-green-500",
  status_failed: "bg-red-500",
  run_created: "bg-blue-500",
  status_devin_reproducing: "bg-orange-500",
  status_devin_fixing: "bg-orange-500",
  status_pr_ready: "bg-indigo-500",
};

export function ScenarioTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-1">
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className={`w-2 h-2 rounded-full ${eventDot[entry.event] ?? "bg-slate-400"}`} />
              {i < entries.length - 1 && <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mt-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {eventLabels[entry.event] ?? entry.event}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatRelativeTime(new Date(entry.timestamp))}
                </span>
              </div>
              {entry.detail && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{entry.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
