import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId, orgRole } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (orgRole !== "owner" && orgRole !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const chunks = await prisma.knowledgeChunk.findMany({
    select: { sourcePath: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byFile: Record<string, { count: number; lastUpdated: Date }> = {};
  for (const chunk of chunks) {
    if (!byFile[chunk.sourcePath]) {
      byFile[chunk.sourcePath] = { count: 0, lastUpdated: chunk.createdAt };
    }
    byFile[chunk.sourcePath].count++;
    if (chunk.createdAt > byFile[chunk.sourcePath].lastUpdated) {
      byFile[chunk.sourcePath].lastUpdated = chunk.createdAt;
    }
  }

  const lastIngestionAt =
    chunks.length > 0
      ? chunks.reduce((latest, c) => (c.createdAt > latest ? c.createdAt : latest), chunks[0].createdAt)
      : null;

  return NextResponse.json({
    totalChunks: chunks.length,
    byFile: Object.entries(byFile).map(([sourcePath, data]) => ({
      sourcePath,
      count: data.count,
      lastUpdated: data.lastUpdated,
    })),
    lastIngestionAt,
  });
}
