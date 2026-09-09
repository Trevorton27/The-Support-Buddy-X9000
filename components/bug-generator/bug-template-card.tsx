"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bug, Check, Loader2, Undo2, Ticket } from "lucide-react";

interface BugTemplateCardProps {
  id: string;
  title: string;
  service: string;
  severity: string;
  difficulty: string;
  category: string;
  isActive: boolean;
}

const severityColor: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  low: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const difficultyColor: Record<string, string> = {
  easy: "text-green-600 dark:text-green-400",
  medium: "text-amber-600 dark:text-amber-400",
  hard: "text-red-600 dark:text-red-400",
};

export function BugTemplateCard({
  id, title, service, severity, difficulty, category, isActive,
}: BugTemplateCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleAction(action: "inject" | "inject-with-ticket" | "fix") {
    setLoading(action);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/bug-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, templateId: id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Action failed");
        return;
      }
      setResult(
        action === "fix"
          ? "Bug fixed"
          : action === "inject-with-ticket"
          ? `Injected + ticket ${data.ticketId?.slice(0, 10) ?? ""}...`
          : "Bug injected"
      );
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={`border rounded-lg p-4 space-y-3 transition-colors ${
      isActive
        ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isActive && <Bug className="w-4 h-4 text-red-500 shrink-0" />}
            <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{title}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              {service}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${severityColor[severity] ?? severityColor.low}`}>
              {severity}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{category}</span>
            <span className={`text-xs ${difficultyColor[difficulty] ?? ""}`}>{difficulty}</span>
          </div>
        </div>
        {isActive && (
          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded-full dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 shrink-0">
            Active
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isActive ? (
          <button
            onClick={() => handleAction("fix")}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 dark:border-green-700 dark:bg-green-950/40 dark:text-green-400 transition-colors"
          >
            {loading === "fix" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
            Revert Fix
          </button>
        ) : (
          <>
            <button
              onClick={() => handleAction("inject")}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:bg-red-950/40 dark:text-red-400 transition-colors"
            >
              {loading === "inject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bug className="w-3.5 h-3.5" />}
              Inject Bug
            </button>
            <button
              onClick={() => handleAction("inject-with-ticket")}
              disabled={loading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400 transition-colors"
            >
              {loading === "inject-with-ticket" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />}
              Inject + Create Ticket
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {result && <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><Check className="w-3 h-3" />{result}</p>}
    </div>
  );
}
