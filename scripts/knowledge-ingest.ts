/**
 * knowledge-ingest.ts
 *
 * Ingests all markdown files from knowledge/ and knowledge-base/ into the
 * KnowledgeDocument + KnowledgeChunk tables, embedding each chunk with
 * text-embedding-3-small for pgvector similarity search.
 *
 * Features:
 *   - Parses **Source Type:** / **Tags:** / **Product Area:** etc. from front-matter
 *   - Falls back to folder-path heuristic when front-matter is absent (legacy files)
 *   - Upserts KnowledgeDocument on filePath (idempotent re-runs)
 *   - Heading-aware chunking via lib/knowledge-chunker.ts (~800 tokens each)
 *   - Upserts KnowledgeChunk via $executeRaw (required for pgvector column)
 *   - Optional --summarize flag: generates a gpt-4o-mini summary per document
 *   - Skips knowledge/external-docs/ subdirectory by default (add --external to include)
 *   - Prints per-source-type stats on completion
 *
 * Usage:
 *   npm run knowledge:ingest                  # ingest knowledge/ + knowledge-base/
 *   npm run knowledge:ingest -- --summarize   # also generate summaries
 *   npm run knowledge:ingest -- --external    # include knowledge/external-docs/
 *   npm run knowledge:ingest -- --force       # re-embed even if document unchanged
 */

import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, basename, dirname } from "path";
import OpenAI from "openai";
import { chunkMarkdown } from "../lib/knowledge-chunker";

// ─── Config ──────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ROOT = process.cwd();
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const KNOWLEDGE_BASE_DIR = join(ROOT, "knowledge-base");
const EXTERNAL_DOCS_DIR = join(ROOT, "knowledge", "external-docs");

const SUMMARIZE = process.argv.includes("--summarize");
const INCLUDE_EXTERNAL = process.argv.includes("--external");
const FORCE = process.argv.includes("--force");

// ─── Source-type detection ────────────────────────────────────────────────────

// Map folder segments → sourceType
const FOLDER_SOURCE_TYPE: Record<string, string> = {
  runbooks: "RUNBOOK",
  tickets: "SUPPORT_TICKET",
  incidents: "INCIDENT_REPORT",
  "product-docs": "PRODUCT_DOC",
  architecture: "ARCHITECTURE_DOC",
  alerts: "ALERT",
  logs: "LOG_SUMMARY",
  "external-docs": "EXTERNAL_DOC",
  "knowledge-base": "PRODUCT_DOC", // legacy fallback
};

function detectSourceType(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  for (const part of parts) {
    if (FOLDER_SOURCE_TYPE[part]) return FOLDER_SOURCE_TYPE[part];
  }
  return "PRODUCT_DOC";
}

/**
 * Derive a human-readable sourceName from the file path.
 * For external-docs, use the subfolder (e.g. "clerk", "kubernetes").
 * For other knowledge/ subdirs, use the direct parent folder name.
 */
function detectSourceName(filePath: string): string {
  const rel = filePath.replace(/\\/g, "/");
  const externalMatch = rel.match(/knowledge\/external-docs\/([^/]+)\//);
  if (externalMatch) return externalMatch[1];
  const knowledgeMatch = rel.match(/knowledge\/([^/]+)\//);
  if (knowledgeMatch) return knowledgeMatch[1];
  // knowledge-base legacy files
  const legacyMatch = rel.match(/knowledge-base\/([^/]+)\//);
  if (legacyMatch) return legacyMatch[1];
  return basename(dirname(filePath));
}

// ─── Front-matter parser ──────────────────────────────────────────────────────

interface DocMeta {
  title: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  productArea: string | null;
  customerSegment: string | null;
  severity: string | null;
  tags: string[];
}

function parseMeta(content: string, filePath: string): DocMeta {
  const lines = content.split("\n");

  // Extract first H1 as title, fall back to filename
  const h1 = lines.find((l) => /^#\s+/.test(l));
  const title = h1 ? h1.replace(/^#\s+/, "").trim() : basename(filePath, ".md");

  function extractField(label: string): string | null {
    const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)`, "m");
    const m = content.match(re);
    return m ? m[1].trim() : null;
  }

  const rawSourceType = extractField("Source Type");
  const rawTags = extractField("Tags");

  return {
    title,
    sourceType: rawSourceType ?? detectSourceType(filePath),
    sourceName: detectSourceName(filePath),
    sourceUrl: extractField("Source URL"),
    productArea: extractField("Product Area"),
    customerSegment: extractField("Customer Segment"),
    severity: extractField("Severity"),
    tags: rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
}

// ─── File walker ──────────────────────────────────────────────────────────────

function getAllMarkdownFiles(dir: string, exclude?: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (exclude && full === exclude) continue;
      files.push(...getAllMarkdownFiles(full, exclude));
    } else if (entry.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.replace(/\n/g, " "),
  });
  return response.data[0].embedding;
}

// ─── Optional summarizer ──────────────────────────────────────────────────────

async function summarizeDoc(title: string, content: string): Promise<string> {
  const truncated = content.slice(0, 6000); // stay within context budget
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a technical documentation summarizer. Write a 2-3 sentence summary of the given document for use in a support-operations knowledge base. Focus on what problem it solves and key procedures it covers.",
      },
      {
        role: "user",
        content: `Document title: ${title}\n\n${truncated}`,
      },
    ],
    max_tokens: 200,
    temperature: 0,
  });
  return response.choices[0].message.content?.trim() ?? "";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nKnowledge Ingest Pipeline");
  console.log("─".repeat(55));
  if (SUMMARIZE) console.log("  Summarize mode: ON (gpt-4o-mini)");
  if (FORCE) console.log("  Force mode: ON (re-embedding all chunks)");
  if (INCLUDE_EXTERNAL) console.log("  External docs: included");

  // Collect files
  const knowledgeFiles = getAllMarkdownFiles(
    KNOWLEDGE_DIR,
    INCLUDE_EXTERNAL ? undefined : EXTERNAL_DOCS_DIR,
  );
  const legacyFiles = getAllMarkdownFiles(KNOWLEDGE_BASE_DIR);
  const allFiles = [...knowledgeFiles, ...legacyFiles];

  console.log(`\nFound ${allFiles.length} files (${knowledgeFiles.length} knowledge/, ${legacyFiles.length} knowledge-base/)\n`);

  const stats: Record<string, { docs: number; chunks: number; skipped: number }> = {};

  function getStats(sourceType: string) {
    if (!stats[sourceType]) stats[sourceType] = { docs: 0, chunks: 0, skipped: 0 };
    return stats[sourceType];
  }

  for (const absPath of allFiles) {
    const filePath = relative(ROOT, absPath); // e.g. knowledge/runbooks/webhook-delivery-failures.md
    const content = readFileSync(absPath, "utf-8");
    const meta = parseMeta(content, filePath);
    const st = getStats(meta.sourceType);

    // Check if document exists and content is unchanged
    const existing = await prisma.knowledgeDocument.findUnique({
      where: { filePath },
      select: { id: true, content: true },
    });

    if (existing && existing.content === content && !FORCE) {
      process.stdout.write(`  ↩  ${filePath.slice(0, 60).padEnd(60)} (unchanged)\n`);
      st.skipped++;
      continue;
    }

    // Upsert KnowledgeDocument
    const doc = await prisma.knowledgeDocument.upsert({
      where: { filePath },
      create: {
        title: meta.title,
        sourceType: meta.sourceType,
        sourceName: meta.sourceName,
        sourceUrl: meta.sourceUrl,
        productArea: meta.productArea,
        customerSegment: meta.customerSegment,
        severity: meta.severity,
        tags: meta.tags,
        content,
        filePath,
        orgId: "",
      },
      update: {
        title: meta.title,
        sourceType: meta.sourceType,
        sourceName: meta.sourceName,
        sourceUrl: meta.sourceUrl,
        productArea: meta.productArea,
        customerSegment: meta.customerSegment,
        severity: meta.severity,
        tags: meta.tags,
        content,
        updatedAt: new Date(),
      },
    });

    // Optional: generate summary
    if (SUMMARIZE && !doc.summary) {
      const summary = await summarizeDoc(meta.title, content);
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { summary },
      });
    }

    // Chunk content
    const chunks = chunkMarkdown(content);

    // Embed + upsert each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embedText(chunk.content);
      const vectorStr = `[${embedding.join(",")}]`;

      const chunkMetadata = {
        heading: chunk.heading,
        sourceType: meta.sourceType,
        tags: meta.tags,
        productArea: meta.productArea,
      };

      await prisma.$executeRaw`
        INSERT INTO "KnowledgeChunk" (
          id, "documentId", "sourcePath", "chunkIndex",
          content, embedding, "tokenCount", metadata, "createdAt"
        )
        VALUES (
          gen_random_uuid()::text,
          ${doc.id},
          ${filePath},
          ${i},
          ${chunk.content},
          ${vectorStr}::vector,
          ${chunk.tokenCount},
          ${JSON.stringify(chunkMetadata)}::jsonb,
          NOW()
        )
        ON CONFLICT ("sourcePath", "chunkIndex")
        DO UPDATE SET
          content     = EXCLUDED.content,
          embedding   = EXCLUDED.embedding,
          "documentId" = EXCLUDED."documentId",
          "tokenCount" = EXCLUDED."tokenCount",
          metadata    = EXCLUDED.metadata
      `;
    }

    process.stdout.write(
      `  ✓  ${filePath.slice(0, 52).padEnd(52)} ${String(chunks.length).padStart(2)} chunks\n`,
    );
    st.docs++;
    st.chunks += chunks.length;
  }

  // Delete orphaned chunks (chunkIndex >= new chunk count for updated docs)
  // This handles the case where a re-ingested file produces fewer chunks than before
  for (const absPath of allFiles) {
    const filePath = relative(ROOT, absPath);
    const content = readFileSync(absPath, "utf-8");
    const newChunkCount = chunkMarkdown(content).length;

    await prisma.$executeRaw`
      DELETE FROM "KnowledgeChunk"
      WHERE "sourcePath" = ${filePath}
        AND "chunkIndex" >= ${newChunkCount}
    `;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(55));
  console.log("Results by source type:\n");
  const colW = 28;
  for (const [sourceType, s] of Object.entries(stats).sort()) {
    const label = sourceType.padEnd(colW);
    const counts = s.docs > 0 || s.skipped > 0
      ? `${s.docs} docs, ${s.chunks} chunks${s.skipped > 0 ? `, ${s.skipped} skipped` : ""}`
      : "—";
    console.log(`  ${label} ${counts}`);
  }

  const totalDocs = Object.values(stats).reduce((a, s) => a + s.docs, 0);
  const totalChunks = Object.values(stats).reduce((a, s) => a + s.chunks, 0);
  const totalSkipped = Object.values(stats).reduce((a, s) => a + s.skipped, 0);
  console.log("\n" + "─".repeat(55));
  console.log(
    `Total: ${totalDocs} docs upserted, ${totalChunks} chunks embedded, ${totalSkipped} skipped`,
  );
  if (totalDocs > 0 || totalChunks > 0) {
    console.log("Run `npm run dev` to query via /api/search\n");
  }
}

main()
  .catch((e) => {
    console.error("knowledge-ingest failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
