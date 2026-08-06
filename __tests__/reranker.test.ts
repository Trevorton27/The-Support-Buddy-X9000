import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { KnowledgeChunk } from "@/agents/state";

// Control whether the env returns an API key
let mockApiKey: string | undefined = undefined;

vi.mock("@/lib/env", () => ({
  getEnv: () => {
    if (!mockApiKey) throw new Error("Missing env");
    return { HUGGING_FACE_API_KEY: mockApiKey };
  },
}));

// Import rerankChunks AFTER mocks are set up
import { rerankChunks } from "@/lib/reranker";

function makeChunk(id: string, content: string): KnowledgeChunk {
  return { id, sourcePath: "test.md", chunkIndex: 0, content };
}

beforeEach(() => {
  mockApiKey = undefined;
  vi.clearAllMocks();
  // Clear module-level cache between tests by resetting fetch spy
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rerankChunks", () => {
  it("returns original chunk order when HUGGING_FACE_API_KEY is absent", async () => {
    mockApiKey = undefined;
    const chunks = [makeChunk("a", "first"), makeChunk("b", "second")];
    const result = await rerankChunks("query", chunks);
    expect(result).toEqual(chunks);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("returns original chunk order when fetch throws (API unreachable)", async () => {
    mockApiKey = "hf-test-key";
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    const chunks = [makeChunk("a", "first"), makeChunk("b", "second")];
    const result = await rerankChunks("query", chunks);
    expect(result).toEqual(chunks);
  });

  it("returns original chunk order when API returns non-200 status", async () => {
    mockApiKey = "hf-test-key";
    vi.mocked(fetch).mockResolvedValue(
      new Response("Service unavailable", { status: 503 })
    );
    const chunks = [makeChunk("a", "first"), makeChunk("b", "second")];
    const result = await rerankChunks("query", chunks);
    expect(result).toEqual(chunks);
  });

  it("reorders chunks by descending score when API succeeds", async () => {
    mockApiKey = "hf-test-key";
    const chunks = [
      makeChunk("a", "low relevance"),
      makeChunk("b", "high relevance"),
      makeChunk("c", "medium relevance"),
    ];
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([0.1, 0.9, 0.5]), { status: 200 })
    );
    const result = await rerankChunks("query", chunks);
    expect(result[0].id).toBe("b"); // score 0.9
    expect(result[1].id).toBe("c"); // score 0.5
    expect(result[2].id).toBe("a"); // score 0.1
  });

  it("caches: second call with same query + chunk IDs does not re-fetch", async () => {
    mockApiKey = "hf-test-key";
    const chunks = [makeChunk("x", "content x"), makeChunk("y", "content y")];
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([0.8, 0.3]), { status: 200 })
    );
    await rerankChunks("same query", chunks);
    await rerankChunks("same query", chunks);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("cache miss: different query triggers a new fetch", async () => {
    mockApiKey = "hf-test-key";
    const chunks = [makeChunk("p", "content p"), makeChunk("q", "content q")];
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([0.7, 0.4]), { status: 200 })
    );
    await rerankChunks("query one", chunks);
    await rerankChunks("query two", chunks);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("returns empty array immediately without fetching when chunks is empty", async () => {
    mockApiKey = "hf-test-key";
    const result = await rerankChunks("query", []);
    expect(result).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
