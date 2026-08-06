"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const SOURCE_TYPES = [
  "RUNBOOK", "INCIDENT_REPORT", "PRODUCT_DOC", "ARCHITECTURE_DOC",
  "SUPPORT_TICKET", "LOG_SUMMARY", "EXTERNAL_DOC",
] as const;

type SourceType = (typeof SOURCE_TYPES)[number];

export function KnowledgeGeneratorForm() {
  const [topicsInput, setTopicsInput] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("RUNBOOK");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ filesWritten: string[]; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const topics = topicsInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (topics.length === 0) {
      setError("Enter at least one topic.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/generate/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topics, sourceType, count }),
      });
      const data = await res.json() as { filesWritten?: string[]; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult({ filesWritten: data.filesWritten ?? [], message: data.message ?? "" });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
          Topics (comma-separated)
        </label>
        <input
          type="text"
          value={topicsInput}
          onChange={(e) => setTopicsInput(e.target.value)}
          placeholder="OAuth token refresh troubleshooting, Database connection pool exhaustion, CDN cache invalidation"
          className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          required
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Separate multiple topics with commas. Each becomes one document.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Source Type
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}
            className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          >
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
            Documents to generate
          </label>
          <input
            type="number" min={1} max={10} value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800 p-4 space-y-2">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">{result.message}</p>
          <ul className="space-y-1">
            {result.filesWritten.map((f) => (
              <li key={f} className="text-xs font-mono text-green-600 dark:text-green-400">{f}</li>
            ))}
          </ul>
        </div>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Generating…" : "Generate Documents"}
      </Button>
    </form>
  );
}
