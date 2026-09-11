import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { retrieveKnowledge, formatEvidenceBlock } from "@/lib/knowledge-retrieval";

const retrieveSchema = z.object({
  query: z.string().min(1).max(2000),
  sourceTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  productArea: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
  minScore: z.number().min(0).max(1).default(0.3),
  ticketId: z.string().optional(),
  investigationRunId: z.string().optional(),
  includeFormattedBlock: z.boolean().default(false),
});

// POST /api/knowledge/retrieve
// Ad-hoc retrieval endpoint — used by the UI search panel and external integrations
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = retrieveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { includeFormattedBlock, ...options } = parsed.data;

  const evidence = await retrieveKnowledge(options.query, options);

  return NextResponse.json({
    evidence,
    total: evidence.length,
    ...(includeFormattedBlock
      ? { formattedBlock: formatEvidenceBlock(evidence) }
      : {}),
  });
}
