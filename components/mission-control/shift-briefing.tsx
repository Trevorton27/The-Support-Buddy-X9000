"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShiftBriefingProps {
  itemCount: number;
  urgentCount: number;
}

export function ShiftBriefing({ itemCount, urgentCount }: ShiftBriefingProps) {
  const [expanded, setExpanded] = useState(true);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const fetchBriefing = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/work-context/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing ?? data.summary ?? `You have ${itemCount} active items, ${urgentCount} urgent.`);
        setGeneratedAt(new Date().toLocaleTimeString());
      }
    } catch {
      setBriefing(`You have ${itemCount} active work items, ${urgentCount} require urgent attention.`);
      setGeneratedAt(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
            Shift Briefing
          </h2>
          {generatedAt && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Generated at {generatedAt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchBriefing}
            disabled={loading}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            {briefing ? "Refresh" : "Generate"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-7 w-7 p-0"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3">
          {briefing ? (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {briefing}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{itemCount}</div>
                  <div className="text-xs text-slate-500">Active Items</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{urgentCount}</div>
                  <div className="text-xs text-slate-500">Urgent</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={fetchBriefing} disabled={loading} className="text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                Generate AI Briefing
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
