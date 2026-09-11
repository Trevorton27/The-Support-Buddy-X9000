import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/knowledge/documents/[id]
// Returns the document with its chunks (content omitted from chunks to keep response lean;
// add ?includeChunks=full to get full chunk content)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const fullChunks = searchParams.get("includeChunks") === "full";

  const document = await prisma.knowledgeDocument.findUnique({
    where: { id },
    include: {
      chunks: {
        select: {
          id: true,
          chunkIndex: true,
          tokenCount: true,
          metadata: true,
          content: fullChunks,
        },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ document });
}
