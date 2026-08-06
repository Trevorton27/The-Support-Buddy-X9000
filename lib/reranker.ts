import { getEnv } from "./env";
import type { KnowledgeChunk } from "@/agents/state";

// Simple in-memory cache keyed by query + chunk IDs, 5-min TTL
const cache = new Map<string, { result: KnowledgeChunk[]; expiry: number }>();

function buildCacheKey(query: string, chunks: KnowledgeChunk[]): string {
  return `${query}::${chunks.map((c) => c.id).join(",")}`;
}

export async function rerankChunks(
  query: string,
  chunks: KnowledgeChunk[]
): Promise<KnowledgeChunk[]> {
  if (chunks.length === 0) return chunks;

  const key = buildCacheKey(query, chunks);
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.result;

  let apiKey: string | undefined;
  try {
    apiKey = getEnv().HUGGING_FACE_API_KEY;
  } catch {
    // env not configured — fallback
  }

  if (!apiKey) return chunks;

  try {
    const response = await fetch(
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
            sentences: chunks.map((c) => c.content),
          },
        }),
      }
    );

    if (!response.ok) return chunks;

    const scores = (await response.json()) as number[];
    console.log("[HF reranker] raw scores from cross-encoder/ms-marco-MiniLM-L-6-v2:", scores);

    if (!Array.isArray(scores) || scores.length !== chunks.length) {
      return chunks;
    }

    const reranked = chunks
      .map((chunk, i) => ({ ...chunk, rerankScore: scores[i] }))
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));

    cache.set(key, { result: reranked, expiry: Date.now() + 5 * 60 * 1000 });
    return reranked;
  } catch {
    return chunks; // Graceful fallback — never throw
  }
}
