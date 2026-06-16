"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SourceTypeBadge } from "./source-type-badge";
import { formatRelativeTime } from "@/lib/utils";
import {
  ArrowLeft,
  Tag,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";

interface Chunk {
  id: string;
  chunkIndex: number;
  tokenCount: number | null;
  metadata: Record<string, unknown> | null;
  content?: string;
}

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
  content: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  chunks: Chunk[];
}

interface Props {
  document: KnowledgeDoc;
}

export function KnowledgeDocumentDetail({ document: doc }: Props) {
  const [chunksOpen, setChunksOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back nav */}
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Knowledge Base
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceTypeBadge sourceType={doc.sourceType} />
          {doc.productArea && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {doc.productArea}
            </span>
          )}
          {doc.severity && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
              {doc.severity}
            </span>
          )}
          {doc.customerSegment && (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {doc.customerSegment}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{doc.title}</h1>

        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {doc.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>Source: <span className="text-slate-600 dark:text-slate-400">{doc.sourceName}</span></span>
          <span>·</span>
          <span>{doc.chunks.length} chunk{doc.chunks.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>Updated {formatRelativeTime(new Date(doc.updatedAt))}</span>
          {doc.sourceUrl && (
            <>
              <span>·</span>
              <a
                href={doc.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Source <ExternalLink className="w-3 h-3" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Summary */}
      {doc.summary && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Summary</p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{doc.summary}</p>
        </Card>
      )}

      {/* Full content */}
      <Card className="p-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Content</p>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {doc.content}
          </pre>
        </div>
      </Card>

      {/* Chunks accordion */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setChunksOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          {chunksOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <Layers className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {doc.chunks.length} embedded chunk{doc.chunks.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            {doc.chunks.reduce((sum, c) => sum + (c.tokenCount ?? 0), 0).toLocaleString()} tokens total
          </span>
        </button>

        {chunksOpen && (
          <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {doc.chunks.map((chunk) => {
              const heading = chunk.metadata?.heading as string | undefined;
              return (
                <div key={chunk.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-400">#{chunk.chunkIndex}</span>
                    {heading && (
                      <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{heading}</span>
                    )}
                    <span className="ml-auto text-xs text-slate-400 shrink-0">
                      {chunk.tokenCount ?? "—"} tok
                    </span>
                  </div>
                  {chunk.content && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 font-mono">
                      {chunk.content.slice(0, 300)}
                      {chunk.content.length > 300 ? "…" : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
