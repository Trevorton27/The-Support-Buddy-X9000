import { prisma } from "./db";
import { Prisma } from "@prisma/client";

export interface KnowledgeChunkResult {
  id: string;
  sourcePath: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export async function searchKnowledge(
  embedding: number[],
  topK = 5
): Promise<KnowledgeChunkResult[]> {
  const vectorStr = `[${embedding.join(",")}]`;

  const results = await prisma.$queryRaw<KnowledgeChunkResult[]>`
    SELECT
      id,
      "sourcePath",
      "chunkIndex",
      content,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM "KnowledgeChunk"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${topK}
  `;

  return results;
}

// ─── Filtered search (Phase 4) ────────────────────────────────────────────────

export interface VectorSearchFilters {
  sourceTypes?: string[];
  tags?: string[];
  productArea?: string;
}

export interface KnowledgeChunkResultFull extends KnowledgeChunkResult {
  documentId: string | null;
  documentTitle: string | null;
  sourceType: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  productArea: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Vector search with optional KnowledgeDocument metadata filters.
 * Fetches `candidateK` candidates so reranking has more to work with, then
 * returns up to `topK` after scoring.
 */
export async function searchKnowledgeFiltered(
  embedding: number[],
  topK = 5,
  candidateK = 15,
  filters: VectorSearchFilters = {},
): Promise<KnowledgeChunkResultFull[]> {
  const vectorStr = `[${embedding.join(",")}]`;

  // Build dynamic WHERE conditions
  const conditions: Prisma.Sql[] = [Prisma.sql`kc.embedding IS NOT NULL`];

  if (filters.sourceTypes && filters.sourceTypes.length > 0) {
    conditions.push(
      Prisma.sql`kd."sourceType" = ANY(${filters.sourceTypes})`,
    );
  }
  if (filters.productArea) {
    conditions.push(Prisma.sql`kd."productArea" = ${filters.productArea}`);
  }
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(
      Prisma.sql`kd.tags @> ${JSON.stringify(filters.tags)}::jsonb`,
    );
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const results = await prisma.$queryRaw<KnowledgeChunkResultFull[]>`
    SELECT
      kc.id,
      kc."sourcePath",
      kc."chunkIndex",
      kc.content,
      kc."documentId",
      kc.metadata,
      kd.title          AS "documentTitle",
      kd."sourceType",
      kd."sourceName",
      kd."sourceUrl",
      kd."productArea",
      kd.tags,
      1 - (kc.embedding <=> ${vectorStr}::vector) AS similarity
    FROM "KnowledgeChunk" kc
    LEFT JOIN "KnowledgeDocument" kd ON kc."documentId" = kd.id
    ${whereClause}
    ORDER BY kc.embedding <=> ${vectorStr}::vector
    LIMIT ${candidateK}
  `;

  return results.slice(0, topK);
}

/**
 * Keyword fallback using PostgreSQL full-text search.
 * Used when vector results are sparse (below minScore threshold).
 */
export async function searchKnowledgeKeyword(
  query: string,
  excludeIds: string[],
  topK = 5,
): Promise<KnowledgeChunkResultFull[]> {
  // Use a short excerpt of the query to avoid plainto_tsquery issues with very long strings
  const safeQuery = query.slice(0, 200);

  const results = await prisma.$queryRaw<KnowledgeChunkResultFull[]>`
    SELECT
      kc.id,
      kc."sourcePath",
      kc."chunkIndex",
      kc.content,
      kc."documentId",
      kc.metadata,
      kd.title          AS "documentTitle",
      kd."sourceType",
      kd."sourceName",
      kd."sourceUrl",
      kd."productArea",
      kd.tags,
      0.1::float        AS similarity
    FROM "KnowledgeChunk" kc
    LEFT JOIN "KnowledgeDocument" kd ON kc."documentId" = kd.id
    WHERE kc.embedding IS NOT NULL
      AND (
        to_tsvector('english', kc.content) @@ plainto_tsquery('english', ${safeQuery})
        OR kd.title ILIKE ${"%" + safeQuery.slice(0, 80) + "%"}
      )
      AND kc.id != ALL(${excludeIds.length > 0 ? excludeIds : ["__none__"]})
    LIMIT ${topK}
  `;

  return results;
}
