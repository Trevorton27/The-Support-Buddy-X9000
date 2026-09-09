"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, XCircle, RotateCcw, Loader2 } from "lucide-react";

interface InvestigationActionsProps {
  runId: string;
  status: string;
}

const PAUSABLE = ["running", "pending", "awaiting_approval"];
const CANCELLABLE = ["running", "pending", "awaiting_approval", "paused"];
const RESTARTABLE = ["failed", "cancelled", "paused", "complete"];

export function InvestigationActions({ runId, status }: InvestigationActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canPause = PAUSABLE.includes(status);
  const canCancel = CANCELLABLE.includes(status);
  const canRestart = RESTARTABLE.includes(status);

  if (!canPause && !canCancel && !canRestart) return null;

  async function handleAction(action: "pause" | "cancel" | "restart") {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/investigations/${runId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Action failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canPause && (
        <button
          onClick={() => handleAction("pause")}
          disabled={loading !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60 transition-colors"
        >
          {loading === "pause" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
          Pause
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => handleAction("cancel")}
          disabled={loading !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60 transition-colors"
        >
          {loading === "cancel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
          Cancel
        </button>
      )}
      {canRestart && (
        <button
          onClick={() => handleAction("restart")}
          disabled={loading !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60 transition-colors"
        >
          {loading === "restart" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Restart
        </button>
      )}
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
