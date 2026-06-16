import { retrieveKnowledge } from "@/lib/knowledge-retrieval";
import type { KnowledgeChunk } from "../state";

// Phase 6: replaced raw searchKnowledge + rerankChunks with retrieveKnowledge(),
// which handles embedding, filtered vector search, keyword fallback, reranking,
// [KB-N] label assignment, and RetrievalResult audit writes in one call.
export async function searchDocs(query: string, topK = 5): Promise<KnowledgeChunk[]> {
  const evidence = await retrieveKnowledge(query, {
    limit: topK,
    minScore: 0.25,
    skipAudit: true, // audit written by ticket-specific context route, not here
  });

  return evidence.map((e) => ({
    id: e.chunkId,
    // sourcePath preserved for display in existing UI components
    sourcePath: e.documentTitle || e.sourceName,
    chunkIndex: 0,
    content: e.fullContent,
    similarity: e.score,
    rerankScore: e.rerankScore,
    documentId: e.documentId,
    documentTitle: e.documentTitle,
    sourceType: e.sourceType,
    citationLabel: e.citationLabel,
  }));
}
