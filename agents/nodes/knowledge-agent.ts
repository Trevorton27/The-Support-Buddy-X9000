import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage } from "@/lib/agent-utils";
import { getGitSha } from "@/lib/git-sha";
import { searchDocs } from "../tools/docs-tool";
import { formatEvidenceBlock } from "@/lib/knowledge-retrieval";
import type { InvestigationState, KnowledgeChunk } from "../state";

const logger = createLogger("knowledge-agent");

export async function knowledgeAgent(
  state: InvestigationState
): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = "gpt-4o-mini";
  const promptFile = "knowledge-retrieval.md";
  const systemPrompt = readFileSync(join(process.cwd(), `agents/prompts/${promptFile}`), "utf-8");

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "knowledge-retrieval",
      status: "running",
      input: { query: state.ticket.title, promptFile, gitSha: getGitSha() },
    },
  });

  try {
    const query = state.classification
      ? `${state.ticket.title} ${state.classification.affectedProduct} ${state.classification.category}`
      : state.ticket.title;

    // Phase 4: searchDocs now includes reranking via HuggingFace cross-encoder
    const chunks = await searchDocs(query, 5);

    const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

    // Build [KB-N] citation block for the prompt
    const chunksText = formatEvidenceBlock(
      chunks.map((c): Parameters<typeof formatEvidenceBlock>[0][number] => ({
        citationLabel: c.citationLabel ?? `[KB-?]`,
        chunkId: c.id,
        documentId: c.documentId ?? null,
        documentTitle: c.documentTitle ?? c.sourcePath,
        sourceType: c.sourceType ?? "PRODUCT_DOC",
        sourceName: c.sourcePath,
        tags: [],
        score: c.similarity ?? 0,
        rerankScore: c.rerankScore,
        contentExcerpt: c.content.slice(0, 400),
        fullContent: c.content,
      })),
    );

    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Ticket Summary: ${state.classification?.summary || state.ticket.title}\n\nRetrieved Knowledge:\n${chunksText}`,
        },
      ],
    });

    const knowledge = JSON.parse(response.choices[0].message.content || "{}");
    const tokenUsage = extractTokenUsage(response);
    logger.info("Knowledge retrieval complete", { chunksFound: chunks.length });

    const topRerankScore = chunks[0]?.rerankScore;

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: {
          ...knowledge,
          chunksRetrieved: chunks.length,
          citations: chunks.map((c) => ({
            label: c.citationLabel,
            title: c.documentTitle ?? c.sourcePath,
            sourceType: c.sourceType,
            score: c.similarity,
            rerankScore: c.rerankScore ?? null,
          })),
          topRerankScore: topRerankScore ?? null,
        },
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
      },
    });

    return { knowledgeChunks: chunks };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - stepStart },
    });
    logger.error("Knowledge agent failed", { error: msg });
    throw error;
  }
}
