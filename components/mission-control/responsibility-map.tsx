"use client";

import { AlertCircle, Clock, Hourglass, Pause, HelpCircle, CheckCircle, ClipboardCheck, Activity } from "lucide-react";

interface ResponsibilityMapProps {
  counts: {
    needsAction: number;
    inProgress: number;
    waitingCustomer: number;
    waitingInternal: number;
    snoozed: number;
    needsClassification: number;
    recentlyCompleted: number;
    pendingApprovals: number;
  };
}

const statusGroups = [
  { key: "needsAction", label: "Needs Action", icon: AlertCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" },
  { key: "inProgress", label: "In Progress", icon: Activity, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800" },
  { key: "waitingCustomer", label: "Waiting Customer", icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  { key: "waitingInternal", label: "Waiting Internal", icon: Hourglass, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800" },
  { key: "snoozed", label: "Snoozed", icon: Pause, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-950/30", border: "border-slate-200 dark:border-slate-700" },
  { key: "pendingApprovals", label: "Pending Approvals", icon: ClipboardCheck, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800" },
  { key: "needsClassification", label: "Unclear Ownership", icon: HelpCircle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-800" },
  { key: "recentlyCompleted", label: "Completed (24h)", icon: CheckCircle, color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800" },
] as const;

export function ResponsibilityMap({ counts }: ResponsibilityMapProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
        Responsibility Overview
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statusGroups.map(({ key, label, icon: Icon, color, bg, border }) => {
          const count = counts[key];
          return (
            <div
              key={key}
              className={`${bg} border ${border} rounded-lg p-3 transition-colors hover:opacity-80 cursor-default`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
              </div>
              <div className={`text-xl font-bold ${color}`}>{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
