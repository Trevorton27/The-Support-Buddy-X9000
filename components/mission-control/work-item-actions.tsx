"use client";

import { useState } from "react";
import { Play, Check, Pause, Clock, ArrowRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkItemData } from "./work-item-card";

interface WorkItemActionsProps {
  item: WorkItemData;
  onUpdate?: () => void;
}

export function WorkItemActions({ item, onUpdate }: WorkItemActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [snoozeHours, setSnoozeHours] = useState(4);
  const [waitingReason, setWaitingReason] = useState("");
  const [showSnooze, setShowSnooze] = useState(false);
  const [showWait, setShowWait] = useState(false);
  const [showPriority, setShowPriority] = useState(false);
  const [newScore, setNewScore] = useState(item.priorityScore);
  const [reason, setReason] = useState("");

  const callAction = async (action: string, body?: Record<string, unknown>) => {
    setLoading(action);
    try {
      const res = await fetch(`/api/work-items/${item.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) onUpdate?.();
    } finally {
      setLoading(null);
    }
  };

  const isTerminal = item.status === "COMPLETED" || item.status === "CANCELLED";
  if (isTerminal) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {(item.status === "OPEN" || item.status === "NEEDS_CLASSIFICATION") && (
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => callAction("resume")}
            disabled={loading === "resume"}
          >
            <Play className="w-3 h-3 mr-1" /> Start
          </Button>
        )}

        {item.status === "IN_PROGRESS" && (
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => callAction("complete")}
            disabled={loading === "complete"}
          >
            <Check className="w-3 h-3 mr-1" /> Complete
          </Button>
        )}

        {(item.status === "WAITING_CUSTOMER" || item.status === "WAITING_INTERNAL") && (
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => callAction("resume")}
            disabled={loading === "resume"}
          >
            <ArrowRight className="w-3 h-3 mr-1" /> Resume
          </Button>
        )}

        {item.status === "SNOOZED" && (
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => callAction("resume")}
            disabled={loading === "resume"}
          >
            <Play className="w-3 h-3 mr-1" /> Wake Up
          </Button>
        )}

        {(item.status === "OPEN" || item.status === "IN_PROGRESS") && (
          <>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowSnooze(!showSnooze)}>
              <Pause className="w-3 h-3 mr-1" /> Snooze
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowWait(!showWait)}>
              <Clock className="w-3 h-3 mr-1" /> Wait
            </Button>
          </>
        )}

        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowPriority(!showPriority)}>
          <BarChart3 className="w-3 h-3 mr-1" /> Priority
        </Button>
      </div>

      {showSnooze && (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={snoozeHours}
            onChange={(e) => setSnoozeHours(Number(e.target.value))}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value={1}>1 hour</option>
            <option value={4}>4 hours</option>
            <option value={8}>8 hours</option>
            <option value={24}>24 hours</option>
          </select>
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => {
              callAction("snooze", { until: new Date(Date.now() + snoozeHours * 60 * 60 * 1000).toISOString() });
              setShowSnooze(false);
            }}
            disabled={loading === "snooze"}
          >
            Confirm Snooze
          </Button>
        </div>
      )}

      {showWait && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={waitingReason}
            onChange={(e) => setWaitingReason(e.target.value)}
            placeholder="Waiting on..."
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-1"
          />
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => {
              callAction("wait", { waitingOn: waitingReason });
              setShowWait(false);
            }}
            disabled={loading === "wait" || !waitingReason}
          >
            Set Waiting
          </Button>
        </div>
      )}

      {showPriority && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="number" min={0} max={100}
            value={newScore}
            onChange={(e) => setNewScore(Number(e.target.value))}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-16"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason..."
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-1"
          />
          <Button
            variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => {
              callAction("correct", { priorityScore: newScore, reason });
              setShowPriority(false);
            }}
            disabled={loading === "correct" || !reason}
          >
            Update
          </Button>
        </div>
      )}
    </div>
  );
}
