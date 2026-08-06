"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export function DemoReset() {
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  async function handleReset() {
    if (!confirm("This will delete all investigation data and re-seed the database. Continue?")) return;
    setResetting(true);
    setResetResult(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      setResetResult(data.message || "Reset complete");
    } catch {
      setResetResult("Reset failed — check console");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        This deletes all investigation runs, agent steps, and ticket updates, then re-seeds the database
        with the 7 demo tickets and 10 demo customers.
      </p>
      {resetResult && (
        <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          {resetResult}
        </div>
      )}
      <Button
        variant="outline"
        onClick={handleReset}
        disabled={resetting}
        className="border-orange-300 text-orange-700 hover:bg-orange-50"
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        {resetting ? "Resetting..." : "Reset Demo Database"}
      </Button>
    </div>
  );
}
