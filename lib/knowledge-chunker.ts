/**
 * knowledge-chunker.ts
 *
 * Heading-aware markdown chunker for the RAG knowledge base.
 * Targets ~3200 chars (~800 tokens) per chunk with ~600-char overlap
 * and prepends the active section heading to each chunk for context.
 *
 * Also strips the metadata header block used by Phase 2 knowledge files
 * (**Source Type:**, **Tags:**, **Product Area:**, **Severity:**, etc.)
 * so those lines are not embedded as retrievable content.
 */

export interface ChunkResult {
  content: string;
  heading: string | null; // most recent heading above this chunk
  tokenCount: number;     // estimated (chars / 4)
}

// Metadata header lines written by knowledge-fetch-docs.ts and Phase 2 authors
const META_LINE_RE =
  /^\*\*(Source Type|Tags|Product Area|Severity|Customer Segment|Source URL):\*\*/;

/**
 * Strip the metadata header block (bold key-value lines near the top of the file)
 * and return the remaining body text.
 */
function stripMetadata(text: string): string {
  const lines = text.split("\n");
  const body: string[] = [];
  let pastMeta = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!pastMeta && META_LINE_RE.test(line.trim())) {
      // Still in the metadata block — skip this line
      continue;
    }
    pastMeta = true;
    body.push(line);
  }

  return body.join("\n").trim();
}

/**
 * Split markdown text into heading-aware chunks.
 *
 * @param text        Full markdown content (may include metadata header)
 * @param targetChars Target chunk size in characters (default 3200 ≈ 800 tokens)
 * @param overlapChars Characters of overlap carried from previous chunk (default 600)
 */
export function chunkMarkdown(
  text: string,
  targetChars = 3200,
  overlapChars = 600,
): ChunkResult[] {
  const body = stripMetadata(text);

  // Split on two-or-more blank lines to get logical blocks (paragraphs, headings, code fences)
  const rawBlocks = body.split(/\n{2,}/);

  let activeHeading: string | null = null;
  let currentChunk = "";
  let chunkHeading: string | null = null;
  const results: ChunkResult[] = [];

  function flush() {
    const trimmed = currentChunk.trim();
    if (!trimmed) return;

    let content = trimmed;
    // Prepend heading context if the heading is not already present in the chunk
    if (chunkHeading && !content.startsWith(chunkHeading)) {
      content = `${chunkHeading}\n\n${content}`;
    }

    results.push({
      content,
      heading: chunkHeading,
      tokenCount: Math.ceil(content.length / 4),
    });
  }

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;

    const isHeading = /^#{1,4}\s+/.test(block);

    // If adding this block would overflow the target, flush and start a new chunk
    if (
      currentChunk.length + block.length + 2 > targetChars &&
      currentChunk.length > 0
    ) {
      flush();

      // Carry overlap from tail of previous chunk for continuity
      const tail = currentChunk.length > overlapChars
        ? currentChunk.slice(-overlapChars)
        : currentChunk;

      currentChunk = tail.trim() + "\n\n" + block;
      chunkHeading = activeHeading;
    } else {
      if (currentChunk.length === 0) {
        chunkHeading = activeHeading;
      }
      currentChunk += (currentChunk ? "\n\n" : "") + block;
    }

    // Update active heading AFTER placing the block so the heading itself
    // is included in the chunk it introduces, not deferred to the next one.
    if (isHeading) {
      activeHeading = block;
    }
  }

  flush();
  return results;
}
