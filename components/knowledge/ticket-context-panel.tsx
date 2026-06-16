"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SourceTypeBadge } from "./source-type-badge";
import { BookOpen, Search, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RetrievedEvidence {
  citationLabel: string;
  chunkId: string;
  documentId: string | null;
  documentTitle: string;
  sourceType: string;
  sourceName: string;
  sourceUrl?: string;
  tags: string[];
  productArea?: string;
  score: number;
  rerankScore?: number;
  contentExcerpt: string;
  fullContent: string;
}

// ─── Source type grouping ─────────────────────────────────────────────────────

const GROUPS: { label: string; types: string[] }[] = [
  { label: "Runbooks",             types: ["RUNBOOK"] },
  { label: "Incidents & Tickets",  types: ["INCIDENT_REPORT", "SUPPORT_TICKET"] },
  { label: "Docs & Guides",        types: ["PRODUCT_DOC", "ARCHITECTURE_DOC", "EXTERNAL_DOC"] },
  { label: "Alerts & Logs",        types: ["ALERT", "LOG_SUMMARY"] },
];

function groupEvidence(evidence: RetrievedEvidence[]) {
  return GROUPS.map((g) => ({
    ...g,
    items: evidence.filter((e) => g.types.includes(e.sourceType)),
  })).filter((g) => g.items.length > 0);
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const color =
    pct >= 70 ? "bg-green-400 dark:bg-green-500" :
    pct >= 45 ? "bg-amber-400 dark:bg-amber-500" :
                "bg-slate-300 dark:bg-slate-600";

  return (
    <div className="flex items-center gap-1.5" title={`Similarity: ${pct}%`}>
      <div className="h-1 w-16 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
}

// ─── Single evidence card ────────────────────────────────────────────────────

function EvidenceCard({ item }: { item: RetrievedEvidence }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="p-3 bg-white dark:bg-slate-900">
        {/* Top row: citation label + title + score */}
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {item.citationLabel}
          </span>
          <div className="flex-1 min-w-0">
            {item.documentId ? (
              <Link
                href={`/knowledge/${item.documentId}`}
                className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-1"
              >
                {item.documentTitle}
              </Link>
            ) : (
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                {item.documentTitle}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <SourceTypeBadge sourceType={item.sourceType} />
              {item.productArea && (
                <span className="text-xs text-slate-400">{item.productArea}</span>
              )}
              <ScoreBar score={item.rerankScore !== undefined ? Math.min(1, Math.max(0, (item.rerankScore + 10) / 20)) : item.score} />
            </div>
          </div>
        </div>

        {/* Excerpt */}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed line-clamp-3">
          {item.contentExcerpt}
        </p>

        {/* Expand toggle */}
        {item.fullContent.length > item.contentExcerpt.length && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {expanded ? "Show less" : "Show full content"}
          </button>
        )}

        {expanded && (
          <pre className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-2">
            {item.fullContent}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

interface Props {
  ticketId: string;
}

export function TicketContextPanel({ ticketId }: Props) {
  const [evidence, setEvidence] = useState<RetrievedEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch on mount using ticket composite query
  useEffect(() => {
    async function fetchContext() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tickets/${ticketId}/retrieve-context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 8, minScore: 0.25 }),
        });
        if (!res.ok) throw new Error("Retrieval failed");
        const data = await res.json() as { evidence: RetrievedEvidence[] };
        setEvidence(data.evidence);
      } catch {
        setError("Could not load knowledge context. The knowledge base may be empty.");
      } finally {
        setLoading(false);
      }
    }
    fetchContext();
  }, [ticketId]);

  // Manual search
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 8, minScore: 0.2 }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json() as { evidence: RetrievedEvidence[] };
      setEvidence(data.evidence);
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  const groups = groupEvidence(evidence);

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Knowledge Context</span>
        {evidence.length > 0 && (
          <span className="ml-auto text-xs text-slate-400">{evidence.length} result{evidence.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Manual search */}
      <form onSubmit={handleSearch} className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            ref={inputRef}
            placeholder="Search knowledge base…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
          )}
        </div>
      </form>

      {/* Body */}
      <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Retrieving relevant knowledge…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="text-xs text-slate-400 text-center py-6">{error}</p>
        )}

        {/* Empty */}
        {!loading && !error && evidence.length === 0 && (
          <div className="text-center py-8">
            <BookOpen className="w-7 h-7 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              No relevant articles found. Try a manual search above.
            </p>
          </div>
        )}

        {/* Grouped results */}
        {!loading && groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {group.label}
            </p>
            {group.items.map((item) => (
              <EvidenceCard key={item.chunkId} item={item} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
