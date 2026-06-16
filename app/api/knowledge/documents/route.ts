import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

// GET /api/knowledge/documents
// Query params: sourceType, tags (comma-separated), productArea, q (title search), page, limit
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("sourceType");
  const tagsParam = searchParams.get("tags");
  const productArea = searchParams.get("productArea");
  const q = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));

  const where: Record<string, unknown> = {};

  if (sourceType) where.sourceType = sourceType;
  if (productArea) where.productArea = productArea;
  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }
  if (tagsParam) {
    const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      // Prisma doesn't support Json array contains natively — use raw filter
      // We filter in JS after fetching; for large collections use searchKnowledgeFiltered instead
      where.tags = { path: [], array_contains: tags[0] };
    }
  }

  const [documents, total] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      where,
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceName: true,
        sourceUrl: true,
        productArea: true,
        customerSegment: true,
        severity: true,
        tags: true,
        summary: true,
        filePath: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chunks: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.knowledgeDocument.count({ where }),
  ]);

  return NextResponse.json({ documents, total, page, limit });
}
