"use client";

import { useEffect, useState } from "react";

interface TrainingScores {
  rootCauseScore: number;
  severityScore: number;
  deceptionResistanceScore: number;
  overallScore: number;
  passed: boolean;
  reasoning: string;
}

interface ScoreBarProps {
  label: string;
  score: number;
  weight: string;
}

function ScoreBar({ label, score, weight }: ScoreBarProps) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-yellow-600" : "text-red-600 dark:text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">{weight}</span>
          <span className={`font-mono tabular-nums font-medium ${textColor}`}>{pct}%</span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface TrainingScorePanelProps {
  runId: string;
  initialScores?: TrainingScores | null;
}

export function TrainingScorePanel({ runId, initialScores }: TrainingScorePanelProps) {
  const [scores, setScores] = useState<TrainingScores | null>(initialScores ?? null);
  const [loading, setLoading] = useState(!initialScores);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialScores) return;
    fetch("/api/training/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investigationRunId: runId }),
    })
      .then(async (res) => {
        const data = await res.json() as TrainingScores | { error: string };
        if (!res.ok) throw new Error("error" in data ? data.error : "Scoring failed");
        setScores(data as TrainingScores);
      })
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [runId, initialScores]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-3 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32" />
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded" />
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded" />
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded" />
        <div className="text-xs text-slate-400 text-center pt-2">Scoring investigation…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
        Scoring error: {error}
      </div>
    );
  }

  if (!scores) return null;

  const overallPct = Math.round(scores.overallScore * 100);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
          Training Score: {overallPct}%
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
          scores.passed
            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
            : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
        }`}>
          {scores.passed ? "PASS" : "FAIL"}
        </span>
      </div>

      <div className="space-y-2">
        <ScoreBar label="Root Cause Accuracy" score={scores.rootCauseScore} weight="40%" />
        <ScoreBar label="Severity Classification" score={scores.severityScore} weight="20%" />
        <ScoreBar label="Deception Resistance" score={scores.deceptionResistanceScore} weight="40%" />
      </div>

      {scores.reasoning && (
        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
          {scores.reasoning}
        </div>
      )}
    </div>
  );
}
