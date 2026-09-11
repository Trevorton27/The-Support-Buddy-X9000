"use client";

import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkItemCard, type WorkItemData } from "./work-item-card";

interface PriorityQueueProps {
  items: WorkItemData[];
}

const BAND_FILTERS = ["All", "URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const TYPE_FILTERS = [
  "All",
  "CUSTOMER_REPLY",
  "ESCALATION",
  "APPROVAL",
  "INCIDENT_UPDATE",
  "INVESTIGATION",
  "DEVIN_TASK",
  "INTERNAL_FOLLOW_UP",
  "SCHEDULED_CHECK",
  "DOCUMENTATION",
  "MANUAL_TASK",
] as const;

export function PriorityQueue({ items: initialItems }: PriorityQueueProps) {
  const [items, setItems] = useState(initialItems);
  const [bandFilter, setBandFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/work-items?limit=50");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = items.filter((item) => {
    if (bandFilter !== "All" && item.priorityBand !== bandFilter) return false;
    if (typeFilter !== "All" && item.type !== typeFilter) return false;
    return true;
  });

  // Group items by ticketId so related work (investigation + Devin task) appear together
  const ticketGroups = new Map<string, WorkItemData[]>();
  const ungrouped: WorkItemData[] = [];

  for (const item of filtered) {
    if (item.ticketId) {
      const existing = ticketGroups.get(item.ticketId);
      if (existing) {
        existing.push(item);
      } else {
        ticketGroups.set(item.ticketId, [item]);
      }
    } else {
      ungrouped.push(item);
    }
  }

  // Build ordered list: groups with multiple items get a visual container, singles render normally
  const orderedItems: { group: boolean; ticketTitle?: string; items: WorkItemData[] }[] = [];
  // Sort groups by highest priority item
  const sortedGroups = [...ticketGroups.entries()].sort(
    ([, a], [, b]) => Math.max(...b.map((i) => i.priorityScore)) - Math.max(...a.map((i) => i.priorityScore))
  );
  for (const [, groupItems] of sortedGroups) {
    orderedItems.push({
      group: groupItems.length > 1,
      ticketTitle: groupItems[0].ticket?.title,
      items: groupItems.sort((a, b) => b.priorityScore - a.priorityScore),
    });
  }
  for (const item of ungrouped) {
    orderedItems.push({ group: false, items: [item] });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Priority Queue ({filtered.length})
        </h2>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="h-7 px-2 text-xs">
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {BAND_FILTERS.map((band) => (
          <button
            key={band}
            onClick={() => setBandFilter(band)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              bandFilter === band
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            {band}
          </button>
        ))}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 border-none text-slate-600 dark:text-slate-400"
        >
          {TYPE_FILTERS.map((t) => (
            <option key={t} value={t}>
              {t === "All" ? "All Types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
            No work items match the current filters.
          </div>
        ) : (
          orderedItems.map((entry, idx) =>
            entry.group ? (
              <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-2 space-y-2">
                <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 px-2 pt-1">
                  Related work &mdash; {entry.ticketTitle}
                </p>
                {entry.items.map((item) => (
                  <WorkItemCard key={item.id} item={item} onUpdate={refresh} />
                ))}
              </div>
            ) : (
              <WorkItemCard key={entry.items[0].id} item={entry.items[0]} onUpdate={refresh} />
            )
          )
        )}
      </div>
    </div>
  );
}
