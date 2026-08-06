"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AgentOutputCardProps {
  title: string;
  output: unknown;
  defaultOpen?: boolean;
}

export function AgentOutputCard({ title, output, defaultOpen = false }: AgentOutputCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{title}</span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
        )}
      </button>
      {open && (
        <div className="p-3">
          <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-auto max-h-48 whitespace-pre-wrap">
            {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
