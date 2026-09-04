"use client";

import { useState } from "react";
import { HelpCircle, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WorkItemData } from "./work-item-card";

interface NeedsClassificationQueueProps {
  items: WorkItemData[];
  onUpdate?: () => void;
}

export function NeedsClassificationQueue({ items, onUpdate }: NeedsClassificationQueueProps) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

  const classificationItems = items.filter((i) => i.status === "NEEDS_CLASSIFICATION");
  if (classificationItems.length === 0) return null;

  const handleAction = async (itemId: string, action: "confirm" | "dismiss") => {
    setLoading(itemId);
    try {
      const endpoint = action === "confirm" ? "resume" : "complete";
      await fetch(`/api/work-items/${itemId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(action === "dismiss" ? { body: JSON.stringify({ note: "Dismissed from classification queue" }) } : {}),
      });
      onUpdate?.();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3"
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Needs Classification ({classificationItems.length})
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-yellow-600" /> : <ChevronDown className="w-4 h-4 text-yellow-600" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {classificationItems.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.title}
                  </h4>
                  {item.summary && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {item.confidence !== null && (
                      <Badge variant="outline" className="text-[10px]">
                        Confidence: {Math.round(item.confidence * 100)}%
                      </Badge>
                    )}
                    <span className="text-[10px] text-slate-400">{item.type}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => handleAction(item.id, "confirm")}
                    disabled={loading === item.id}
                  >
                    <Check className="w-3 h-3 mr-1" /> Confirm
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs text-slate-500"
                    onClick={() => handleAction(item.id, "dismiss")}
                    disabled={loading === item.id}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
