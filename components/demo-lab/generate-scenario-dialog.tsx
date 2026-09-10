"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SERVICES = [
  "auth-service",
  "webhook-dispatcher",
  "order-service",
  "billing-service",
  "rate-limiter",
  "database-client",
];
const SEVERITIES = ["critical", "high", "medium", "low"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const CATEGORIES = ["authentication", "data", "integration", "performance", "configuration"];

interface ScenarioPreview {
  key: string;
  title: string;
  description: string;
  service: string;
  severity: string;
  difficulty: string;
  category: string;
}

export function GenerateScenarioDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScenarioPreview | null>(null);

  // Form state
  const [mode, setMode] = useState<"generate" | "mutate">("generate");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [category, setCategory] = useState("");
  const [prompt, setPrompt] = useState("");

  async function handleGenerate(save: boolean) {
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch("/api/demo-lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          ...(service && { service }),
          ...(severity && { severity }),
          ...(difficulty && { difficulty }),
          ...(category && { category }),
          ...(prompt && { prompt }),
          save,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
        return;
      }

      if (save) {
        router.refresh();
        setOpen(false);
        resetForm();
      } else {
        setPreview(data.scenario);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setMode("generate");
    setService("");
    setSeverity("");
    setDifficulty("");
    setCategory("");
    setPrompt("");
    setPreview(null);
    setError(null);
  }

  if (!open) {
    return (
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
      >
        <Sparkles className="w-3 h-3 mr-1" />
        Generate Scenario
      </Button>
    );
  }

  return (
    <div className="border border-purple-200 dark:border-purple-800 rounded-xl p-5 space-y-4 bg-purple-50/50 dark:bg-purple-950/20">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Generate New Scenario
        </h3>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); resetForm(); }} className="text-xs">
          Cancel
        </Button>
      </div>

      {/* Mode */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === "generate" ? "default" : "outline"}
          onClick={() => setMode("generate")}
          className="text-xs"
        >
          New Scenario
        </Button>
        <Button
          size="sm"
          variant={mode === "mutate" ? "default" : "outline"}
          onClick={() => setMode("mutate")}
          className="text-xs"
        >
          Mutate Existing
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Service</label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="">Any</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="">Any</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="">Any</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom prompt */}
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
          Custom guidance (optional)
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Create a race condition in the session management layer..."
          className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-16 resize-none"
          maxLength={500}
        />
      </div>

      {/* Preview */}
      {preview && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {preview.title}
            </span>
            <Badge variant="outline" className="text-xs">{preview.severity}</Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{preview.description}</p>
          <div className="flex gap-1.5">
            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
              {preview.service}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{preview.category}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{preview.difficulty}</span>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleGenerate(false)}
          disabled={loading}
          className="text-xs"
        >
          {loading && !preview ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Preview
        </Button>
        <Button
          size="sm"
          onClick={() => handleGenerate(true)}
          disabled={loading}
          className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
        >
          {loading && !preview ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Generate & Save
        </Button>
      </div>
    </div>
  );
}
