"use client";

import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReproduceButtonProps {
  ticketId: string;
  investigationRunId: string;
  repoUrl?: string;
  disabled?: boolean;
  hasActiveTask?: boolean;
}

export function ReproduceButton({
  ticketId,
  investigationRunId,
  repoUrl,
  disabled,
  hasActiveTask,
}: ReproduceButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; workItemId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/devin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "reproduce", ticketId, investigationRunId, repoUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create task");
        return;
      }
      setResult(data);
      setConfirming(false);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <Bot className="w-4 h-4" />
        <span>Reproduction task created.</span>
        <a href="/mission-control" className="underline hover:no-underline">View in Mission Control</a>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
        <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100">Confirm: Reproduce with Devin</h4>
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <li><strong>Mode:</strong> Reproduction only (read-only)</li>
          <li><strong>Repository:</strong> {repoUrl ?? process.env.NEXT_PUBLIC_DEVIN_DEFAULT_REPO ?? "Default"}</li>
          <li><strong>Code changes:</strong> Not allowed</li>
          <li><strong>PR creation:</strong> Not allowed</li>
        </ul>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleConfirm} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Bot className="w-3 h-3 mr-1" />}
            Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={loading}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setConfirming(true)}
      disabled={disabled || hasActiveTask}
    >
      <Bot className="w-3 h-3 mr-1" />
      {hasActiveTask ? "Reproduction in progress" : "Reproduce with Devin"}
    </Button>
  );
}
