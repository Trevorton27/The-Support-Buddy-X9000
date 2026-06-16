import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { KnowledgeLibrary } from "@/components/knowledge/knowledge-library";
import { BookOpen } from "lucide-react";

async function getDocuments() {
  try {
    const [documents, total] = await Promise.all([
      prisma.knowledgeDocument.findMany({
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
        take: 50,
      }),
      prisma.knowledgeDocument.count(),
    ]);
    return { documents, total };
  } catch {
    return { documents: [], total: 0 };
  }
}

export default async function KnowledgePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { documents, total } = await getDocuments();

  // Prisma returns Json fields; normalise tags to string[]
  const normalised = documents.map((doc) => ({
    ...doc,
    tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Knowledge Base</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {total} document{total !== 1 ? "s" : ""} across runbooks, incidents, product docs, and external references
          </p>
        </div>
      </div>

      <KnowledgeLibrary initialDocuments={normalised} initialTotal={total} />
    </div>
  );
}
