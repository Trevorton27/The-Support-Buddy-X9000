import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { z } from "zod";
import { requireOrgAuth } from "@/lib/auth";
import { generateKnowledgeDocuments } from "@/lib/generation/knowledge-generator";

const SOURCE_TYPES = [
  "RUNBOOK", "INCIDENT_REPORT", "PRODUCT_DOC", "ARCHITECTURE_DOC",
  "SUPPORT_TICKET", "LOG_SUMMARY", "EXTERNAL_DOC",
] as const;

const BodySchema = z.object({
  topics: z.array(z.string().min(1)).min(1).max(20),
  sourceType: z.enum(SOURCE_TYPES),
  count: z.number().int().min(1).max(10).default(1),
});

export async function POST(req: NextRequest) {
  const { response: authError } = await requireOrgAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params", details: parsed.error.flatten() }, { status: 400 });
  }

  const { topics, sourceType, count } = parsed.data;

  const docs = await generateKnowledgeDocuments(topics, sourceType, count);

  const filesWritten: string[] = [];
  for (const doc of docs) {
    const absPath = join(process.cwd(), doc.filePath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, doc.content, "utf-8");
    filesWritten.push(doc.filePath);
  }

  return NextResponse.json({
    filesWritten,
    message: `${filesWritten.length} document(s) written. Run 'npm run ingest' to embed them into the knowledge base.`,
  });
}
