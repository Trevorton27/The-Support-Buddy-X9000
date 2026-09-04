"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { scoreToBand } from "@/lib/priority-engine";

interface PriorityExplanationProps {
  score: number;
  band: string;
}

export function PriorityExplanation({ score, band }: PriorityExplanationProps) {
  const [expanded, setExpanded] = useState(false);

  const bandColor =
    band === "URGENT" ? "bg-red-500" :
    band === "HIGH" ? "bg-orange-500" :
    band === "MEDIUM" ? "bg-blue-500" : "bg-slate-400";

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <div className={`w-2 h-2 rounded-full ${bandColor}`} />
        Priority: {Math.round(score)}/100 ({band})
        {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1">
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${bandColor}`}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-1 text-[9px] text-slate-500">
            <span>LOW (0-29)</span>
            <span>MED (30-59)</span>
            <span>HIGH (60-79)</span>
            <span>URGENT (80+)</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export for use in other client components
export { scoreToBand };
