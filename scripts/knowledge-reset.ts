/**
 * knowledge-reset.ts
 *
 * Deletes all managed knowledge data (KnowledgeDocument records and the
 * KnowledgeChunk rows linked to them via documentId).
 *
 * IMPORTANT: Legacy chunks ingested by scripts/ingest-docs.ts (where documentId
 * IS NULL) are intentionally preserved so the old knowledge-base/ pipeline
 * continues to function without changes.
 *
 * Usage:
 *   npm run knowledge:reset
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\nKnowledge Reset");
  console.log("─".repeat(45));

  // 1. Delete managed chunks (those with a documentId)
  const { count: chunksDeleted } = await prisma.knowledgeChunk.deleteMany({
    where: { documentId: { not: null } },
  });
  console.log(`  Deleted ${chunksDeleted} managed KnowledgeChunk rows`);

  // 2. Delete all KnowledgeDocument records
  const { count: docsDeleted } = await prisma.knowledgeDocument.deleteMany({});
  console.log(`  Deleted ${docsDeleted} KnowledgeDocument rows`);

  // 3. Report legacy chunks left intact
  const legacyCount = await prisma.knowledgeChunk.count({
    where: { documentId: null },
  });
  console.log(`  ${legacyCount} legacy KnowledgeChunk rows preserved (documentId IS NULL)`);

  console.log("\nReset complete. Run `npm run knowledge:ingest` to re-ingest.\n");
}

main()
  .catch((e) => {
    console.error("knowledge-reset failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
