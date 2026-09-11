import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import OpenAI from "openai";

function chunkText(text: string, chunkSize = 2000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function getAllMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...getAllMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function POST() {
  const { userId, orgRole } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (orgRole !== "owner" && orgRole !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  const kbDir = join(process.cwd(), "knowledge-base");
  const files = getAllMarkdownFiles(kbDir);
  let chunksUpserted = 0;

  for (const filePath of files) {
    const sourcePath = relative(process.cwd(), filePath);
    const content = readFileSync(filePath, "utf-8");
    const chunks = chunkText(content);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embeddingRes = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk.replace(/\n/g, " "),
      });
      const vector = embeddingRes.data[0].embedding;
      const vectorStr = `[${vector.join(",")}]`;

      await prisma.$executeRaw`
        INSERT INTO "KnowledgeChunk" (id, "sourcePath", "chunkIndex", content, embedding, "createdAt")
        VALUES (
          gen_random_uuid()::text,
          ${sourcePath},
          ${i},
          ${chunk},
          ${vectorStr}::vector,
          NOW()
        )
        ON CONFLICT ("sourcePath", "chunkIndex")
        DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
      `;

      chunksUpserted++;
    }
  }

  return NextResponse.json({ ok: true, chunksUpserted, filesProcessed: files.length });
}
