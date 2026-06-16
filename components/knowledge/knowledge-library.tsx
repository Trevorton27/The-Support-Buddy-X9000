"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SourceTypeBadge } from "./source-type-badge";
import { formatRelativeTime } from "@/lib/utils";
import { Search, FileText, Tag, ExternalLink } from "lucide-react";

const ALL_SOURCE_TYPES = [
  "RUNBOOK",
  "SUPPORT_TICKET",
  "INCIDENT_REPORT",
  "PRODUCT_DOC",
  "ARCHITECTURE_DOC",
  "ALERT",
  "LOG_SUMMARY",
  "EXTERNAL_DOC",
] as const;

interface KnowledgeDoc {
  id: string;
  title: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  productArea: string | null;
  customerSegment: string | null;
  severity: string | null;
  tags: string[];
  summary: string | null;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  _count: { chunks: number };
}

interface Props {
  initialDocuments: KnowledgeDoc[];
  initialTotal: number;
}

export function KnowledgeLibrary({ initialDocuments, initialTotal }: Props) {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>(initialDocuments);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [productArea, setProductArea] = useState("");
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDocuments = useCallback(
    async (q: string, st: string, pa: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (q) params.set("q", q);
        if (st) params.set("sourceType", st);
        if (pa) params.set("productArea", pa);

        const res = await fetch(`/api/knowledge/documents?${params}`);
        if (!res.ok) return;
        const data = await res.json() as { documents: KnowledgeDoc[]; total: number };
        setDocuments(data.documents);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDocuments(query, sourceType, productArea);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, sourceType, productArea, fetchDocuments]);

  // Group by source type for the sidebar counts
  const countsByType = documents.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.sourceType] = (acc[doc.sourceType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex gap-6">
      {/* Sidebar filters */}
      <aside className="w-52 shrink-0 space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Source Type</p>
          <div className="space-y-0.5">
            <button
              onClick={() => setSourceType("")}
              className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                sourceType === ""
                  ? "bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <span>All</span>
              <span className="text-xs text-slate-400">{total}</span>
            </button>
            {ALL_SOURCE_TYPES.map((st) => (
              <button
                key={st}
                onClick={() => setSourceType(sourceType === st ? "" : st)}
                className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors flex items-center justify-between ${
                  sourceType === st
                    ? "bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-slate-100"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <span className="truncate text-xs">{st.replace(/_/g, " ")}</span>
                {countsByType[st] != null && (
                  <span className="text-xs text-slate-400 shrink-0 ml-1">{countsByType[st]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Search + product area filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            placeholder="Product area…"
            value={productArea}
            onChange={(e) => setProductArea(e.target.value)}
            className="w-44"
          />
        </div>

        {/* Results count */}
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {loading ? "Searching…" : `${total} document${total !== 1 ? "s" : ""}`}
        </p>

        {/* Document cards */}
        {documents.length === 0 && !loading && (
          <Card className="p-10 text-center">
            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No documents found.{" "}
              {total === 0
                ? "Run npm run knowledge:ingest to populate the knowledge base."
                : "Try adjusting your filters."}
            </p>
          </Card>
        )}

        <div className="space-y-2">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/knowledge/${doc.id}`}>
              <Card className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <SourceTypeBadge sourceType={doc.sourceType} />
                      {doc.productArea && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{doc.productArea}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {doc.title}
                    </p>

                    {/* Summary */}
                    {doc.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {doc.summary}
                      </p>
                    )}

                    {/* Tags + meta */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {doc.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                      {doc.tags.length > 5 && (
                        <span className="text-xs text-slate-400">+{doc.tags.length - 5}</span>
                      )}
                    </div>
                  </div>

                  {/* Right meta */}
                  <div className="shrink-0 text-right space-y-1">
                    <p className="text-xs text-slate-400">{doc._count.chunks} chunk{doc._count.chunks !== 1 ? "s" : ""}</p>
                    <p className="text-xs text-slate-400">{formatRelativeTime(new Date(doc.updatedAt))}</p>
                    {doc.sourceUrl && (
                      <ExternalLink className="w-3 h-3 text-slate-300 dark:text-slate-600 ml-auto" />
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
