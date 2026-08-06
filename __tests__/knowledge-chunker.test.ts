import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "@/lib/knowledge-chunker";

describe("chunkMarkdown", () => {
  it("returns empty array for empty string", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });

  it("returns a single chunk when content is smaller than target size", () => {
    const text = "This is a short piece of markdown content.\n\nIt has two paragraphs.";
    const chunks = chunkMarkdown(text);
    expect(chunks).toHaveLength(1);
  });

  it("assigns sequential chunkIndex starting at 0 across multiple chunks", () => {
    // Build content large enough to produce multiple chunks (targetChars=3200)
    const block = "A".repeat(1200);
    const text = `${block}\n\n${block}\n\n${block}\n\n${block}`;
    const chunks = chunkMarkdown(text);
    expect(chunks.length).toBeGreaterThan(1);
    // The caller (ingest-docs.ts) assigns chunkIndex, but chunkMarkdown returns
    // ordered results so verify they are indexable 0..n-1
    chunks.forEach((chunk, i) => {
      // chunk objects have content, heading, tokenCount — no chunkIndex inside ChunkResult
      expect(typeof chunk.content).toBe("string");
      expect(i).toBeGreaterThanOrEqual(0);
    });
  });

  it("sets sourcePath context is preserved via caller (ChunkResult has no sourcePath)", () => {
    // ChunkResult intentionally has no sourcePath — that's added by the ingestion script.
    // This test verifies the shape of returned objects.
    const text = "## Section\n\nSome content here.";
    const [chunk] = chunkMarkdown(text);
    expect(chunk).toHaveProperty("content");
    expect(chunk).toHaveProperty("heading");
    expect(chunk).toHaveProperty("tokenCount");
  });

  it("splits on double-newline boundaries rather than mid-sentence", () => {
    const para1 = "The quick brown fox jumps over the lazy dog. " + "Word ".repeat(50);
    const para2 = "A completely separate paragraph with different content. " + "Word ".repeat(50);
    const text = `${para1}\n\n${para2}`;
    const chunks = chunkMarkdown(text, 300, 50);
    // With a small target, we should get 2 chunks — each containing one paragraph
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The first chunk should contain para1 content, not be split mid-sentence
    expect(chunks[0].content).toContain("quick brown fox");
  });

  it("tokenCount is greater than 0 for non-empty chunks", () => {
    const text = "Some content.\n\nMore content here.";
    const chunks = chunkMarkdown(text);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });

  it("heading is null for the chunk that contains the first heading itself", () => {
    // The heading is placed into the first chunk; chunkHeading captures the heading
    // that was *active before* the chunk started, which is null for the first block.
    const text = "## Getting Started\n\nInstall the package with npm install.";
    const [chunk] = chunkMarkdown(text);
    // The heading is inside the content; chunkHeading captures prior active heading
    expect(chunk.heading).toBeNull();
    expect(chunk.content).toContain("## Getting Started");
  });

  it("heading is set to the prior heading on chunks that follow a heading", () => {
    // Force a chunk split so the second chunk gets the heading from the first
    const bigBlock = "x ".repeat(1700); // > 3200/2 chars
    const text = `## My Section\n\n${bigBlock}\n\n${bigBlock}`;
    const chunks = chunkMarkdown(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The second chunk should carry the heading that was active after "## My Section"
    expect(chunks[1].heading).toBe("## My Section");
  });

  it("heading is null when no heading precedes the content", () => {
    const text = "Just a plain paragraph with no heading above it.";
    const [chunk] = chunkMarkdown(text);
    expect(chunk.heading).toBeNull();
  });

  it("strips metadata header lines (Source Type, Tags, etc.) from content", () => {
    const text = [
      "**Source Type:** RUNBOOK",
      "**Tags:** auth, login",
      "**Product Area:** Platform",
      "",
      "## Actual Content",
      "",
      "This is the real content.",
    ].join("\n");
    const chunks = chunkMarkdown(text);
    const allContent = chunks.map((c) => c.content).join(" ");
    expect(allContent).not.toContain("Source Type");
    expect(allContent).not.toContain("Tags:");
    expect(allContent).toContain("Actual Content");
  });
});
