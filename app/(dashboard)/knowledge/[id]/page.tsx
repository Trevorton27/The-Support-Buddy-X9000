import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { KnowledgeDocumentDetail } from "@/components/knowledge/knowledge-document-detail";

async function getDocument(id: string) {
  return prisma.knowledgeDocument.findUnique({
    where: { id },
    include: {
      chunks: {
        select: {
          id: true,
          chunkIndex: true,
          tokenCount: true,
          metadata: true,
          content: true,
        },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
}

export default async function KnowledgeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();

  const normalised = {
    ...doc,
    tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    chunks: doc.chunks.map((c) => ({
      ...c,
      metadata: c.metadata as Record<string, unknown> | null,
    })),
  };

  return (
    <div className="p-8">
      <KnowledgeDocumentDetail document={normalised} />
    </div>
  );
}
