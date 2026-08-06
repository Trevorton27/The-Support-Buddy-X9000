/**
 * knowledge-retrieval.ts
 *
 * Core RAG retrieval service for the knowledge base.
 *
 * Pipeline:
 *   1. Embed query with text-embedding-3-small
 *   2. Vector search with optional metadata filters (sourceTypes, tags, productArea)
 *   3. Keyword fallback via full-text search if vector results are sparse
 *   4. Rerank via HuggingFace cross-encoder (graceful fallback to vector order)
 *   5. Assign [KB-N] citation labels
 *   6. Write RetrievalResult audit row (if ticketId or investigationRunId provided)
 *   7. Return RetrievedEvidence[]
 */

import OpenAI from "openai";
import { prisma } from "./db";
import { getEnv } from "./env";
import {
  searchKnowledgeFiltered,
  searchKnowledgeKeyword,
  type KnowledgeChunkResultFull,
} from "./vector-search";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RetrieveOptions {
  /** Filter to specific source types, e.g. ["RUNBOOK", "INCIDENT_REPORT"] */
  sourceTypes?: string[];
  /** Filter to chunks whose document has ALL of these tags */
  tags?: string[];
  /** Filter to a specific product area, e.g. "Authentication" */
  productArea?: string;
  /** Maximum number of results to return (default: 5) */
  limit?: number;
  /** Minimum cosine similarity score to include a result (default: 0.3) */
  minScore?: number;
  /** If provided, a RetrievalResult audit row is written */
  ticketId?: string;
  /** If provided, a RetrievalResult audit row is written */
  investigationRunId?: string;
  /** Skip writing a RetrievalResult audit row (default: false) */
  skipAudit?: boolean;
}

export interface RetrievedEvidence {
  /** Citation label for use in agent prompts and UI, e.g. "[KB-1]" */
  citationLabel: string;
  chunkId: string;
  documentId: string | null;
  documentTitle: string;
  sourceType: string;
  sourceName: string;
  sourceUrl?: string;
  tags: string[];
  productArea?: string;
  /** Cosine similarity score from pgvector (0–1) */
  score: number;
  /** Cross-encoder rerank score if HuggingFace reranker ran */
  rerankScore?: number;
  /** First 400 chars of the chunk content */
  contentExcerpt: string;
  fullContent: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CANDIDATE_K = 15; // fetch more candidates for reranking
const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0.3;
const KEYWORD_FALLBACK_THRESHOLD = 2; // trigger fallback if fewer than this many pass minScore

// ─── Embedding ────────────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  return _openai;
}

async function embedQuery(query: string): Promise<number[]> {
  const res = await openai().embeddings.create({
    model: "text-embedding-3-small",
    input: query.replace(/\n/g, " "),
  });
  return res.data[0].embedding;
}

// ─── HuggingFace reranker ─────────────────────────────────────────────────────

// 5-minute in-memory cache for rerank results
const rerankCache = new Map<string, { scores: number[]; expiry: number }>();

async function rerankResults(
  query: string,
  chunks: KnowledgeChunkResultFull[],
): Promise<Array<KnowledgeChunkResultFull & { rerankScore?: number }>> {
  if (chunks.length <= 1) return chunks;

  let apiKey: string | undefined;
  try {
    apiKey = getEnv().HUGGING_FACE_API_KEY;
  } catch {
    // env not configured
  }
  if (!apiKey) return chunks;

  const cacheKey = `${query}::${chunks.map((c) => c.id).join(",")}`;
  const cached = rerankCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return chunks
      .map((c, i) => ({ ...c, rerankScore: cached.scores[i] }))
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
  }

  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/cross-encoder/ms-marco-MiniLM-L-6-v2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {
            source_sentence: query,
            sentences: chunks.map((c) => c.content.slice(0, 512)),
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) return chunks;

    const scores = (await res.json()) as number[];
    console.log("[HF knowledge-retrieval] raw scores from cross-encoder/ms-marco-MiniLM-L-6-v2:", scores);
    if (!Array.isArray(scores) || scores.length !== chunks.length) return chunks;

    rerankCache.set(cacheKey, { scores, expiry: Date.now() + 5 * 60 * 1000 });

    return chunks
      .map((c, i) => ({ ...c, rerankScore: scores[i] }))
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
  } catch {
    return chunks; // graceful fallback — never throw
  }
}

// ─── Normalise raw chunk → RetrievedEvidence ─────────────────────────────────

function chunkToEvidence(
  chunk: KnowledgeChunkResultFull & { rerankScore?: number },
  index: number,
): RetrievedEvidence {
  // For legacy chunks (documentId IS NULL), fall back to metadata stored in the chunk
  const meta = (chunk.metadata ?? {}) as Record<string, unknown>;

  const documentTitle =
    chunk.documentTitle ??
    String(meta.heading ?? chunk.sourcePath.split("/").pop()?.replace(".md", "") ?? "Unknown");

  const sourceType =
    chunk.sourceType ?? String(meta.sourceType ?? "PRODUCT_DOC");

  const sourceName =
    chunk.sourceName ??
    chunk.sourcePath.split("/").slice(-2, -1)[0] ??
    "knowledge-base";

  const tags: string[] =
    chunk.tags ??
    (Array.isArray(meta.tags) ? (meta.tags as string[]) : []);

  return {
    citationLabel: `[KB-${index + 1}]`,
    chunkId: chunk.id,
    documentId: chunk.documentId,
    documentTitle,
    sourceType,
    sourceName,
    sourceUrl: chunk.sourceUrl ?? undefined,
    tags,
    productArea: (chunk.productArea ?? String(meta.productArea ?? "")) || undefined,
    score: Number(chunk.similarity),
    rerankScore: chunk.rerankScore,
    contentExcerpt: chunk.content.slice(0, 400),
    fullContent: chunk.content,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function retrieveKnowledge(
  query: string,
  options: RetrieveOptions = {},
): Promise<RetrievedEvidence[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

  // 1. Embed the query
  const embedding = await embedQuery(query);

  // 2. Vector search with metadata filters
  const vectorResults = await searchKnowledgeFiltered(
    embedding,
    CANDIDATE_K,      // fetch extra candidates for reranking
    CANDIDATE_K,
    {
      sourceTypes: options.sourceTypes,
      tags: options.tags,
      productArea: options.productArea,
    },
  );

  // 3. Filter by minimum score
  const aboveThreshold = vectorResults.filter(
    (r) => Number(r.similarity) >= minScore,
  );

  // 4. Keyword fallback if vector results are sparse
  let combined = aboveThreshold;
  if (aboveThreshold.length < KEYWORD_FALLBACK_THRESHOLD) {
    const existingIds = vectorResults.map((r) => r.id);
    const keywordResults = await searchKnowledgeKeyword(
      query,
      existingIds,
      limit,
    );
    combined = [...aboveThreshold, ...keywordResults];
  }

  // 5. Rerank (falls back to vector order if HF key absent / API fails)
  const reranked = await rerankResults(query, combined);

  // 6. Take top `limit`
  const final = reranked.slice(0, limit);

  // 7. Map to RetrievedEvidence with [KB-N] labels
  const evidence = final.map((chunk, i) => chunkToEvidence(chunk, i));

  // 8. Write RetrievalResult audit row
  if (
    !options.skipAudit &&
    (options.ticketId || options.investigationRunId) &&
    evidence.length > 0
  ) {
    await prisma.retrievalResult.create({
      data: {
        ticketId: options.ticketId ?? null,
        investigationRunId: options.investigationRunId ?? null,
        query,
        matchedChunkIds: evidence.map((e) => e.chunkId),
        scoreMetadata: evidence.map((e) => ({
          chunkId: e.chunkId,
          score: e.score,
          rerankScore: e.rerankScore,
        })),
      },
    });
  }

  return evidence;
}

/**
 * Format RetrievedEvidence[] as a structured citation block for agent prompts.
 *
 * Example output:
 *   [KB-1] Title: Webhook Delivery Troubleshooting Runbook
 *   Source Type: RUNBOOK | Tags: webhook, authentication
 *   Score: 0.87
 *   Content: ...excerpt...
 */
export function formatEvidenceBlock(evidence: RetrievedEvidence[]): string {
  if (evidence.length === 0) return "No relevant knowledge base articles found.";

  return evidence
    .map((e) => {
      const tags = e.tags.length > 0 ? e.tags.join(", ") : "—";
      const score = e.score.toFixed(2);
      const rerankLine =
        e.rerankScore !== undefined
          ? `\nRerank Score: ${e.rerankScore.toFixed(3)}`
          : "";
      const productArea = e.productArea ? ` | Product Area: ${e.productArea}` : "";

      return [
        `${e.citationLabel} Title: ${e.documentTitle}`,
        `Source Type: ${e.sourceType} | Tags: ${tags}${productArea}`,
        `Score: ${score}${rerankLine}`,
        `Content: ${e.contentExcerpt}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}
