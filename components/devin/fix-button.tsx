"use client";

import { useState } from "react";
import { Bot, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FixButtonProps {
  investigationRunId: string;
  ticketId: string;
  repoUrl?: string;
  disabled?: boolean;
  hasActiveTask?: boolean;
}

export function FixButton({
  investigationRunId,
  ticketId,
  repoUrl,
  disabled,
  hasActiveTask,
}: FixButtonProps) {
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
        body: JSON.stringify({ mode: "fix", ticketId, investigationRunId, repoUrl }),
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
        <span>Fix task created.</span>
        <a href="/mission-control" className="underline hover:no-underline">View in Mission Control</a>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3 bg-amber-50 dark:bg-amber-950/30">
        <h4 className="text-sm font-medium text-amber-900 dark:text-amber-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Confirm: Send to Devin (Fix Mode)
        </h4>
        <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <li><strong>Mode:</strong> Fix</li>
          <li><strong>Code changes:</strong> Authorized</li>
          <li><strong>PR creation:</strong> Authorized</li>
          <li><strong>Auto-merge:</strong> NOT authorized</li>
        </ul>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This authorizes Devin to create a branch and open a Pull Request. A human must still review and merge the PR.
        </p>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleConfirm} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Bot className="w-3 h-3 mr-1" />}
            Authorize Fix
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
      className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
      onClick={() => setConfirming(true)}
      disabled={disabled || hasActiveTask}
    >
      <Bot className="w-3 h-3 mr-1" />
      {hasActiveTask ? "Fix in progress" : "Send to Devin (Fix)"}
    </Button>
  );
}
