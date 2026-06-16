import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage } from "@/lib/agent-utils";
import { formatEvidenceBlock } from "@/lib/knowledge-retrieval";
import type { InvestigationState } from "../state";

const logger = createLogger("response-agent");

export async function responseAgent(
  state: InvestigationState
): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = "gpt-4o";

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "response-drafting",
      status: "running",
      input: { hypothesesCount: state.hypotheses.length },
    },
  });

  try {
    const systemPrompt = readFileSync(
      join(process.cwd(), "agents/prompts/response-drafting.md"),
      "utf-8"
    );

    const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

    const topHypothesis = state.hypotheses[0];
    const contextSummary = `
## Customer
Name: ${state.customer?.name}
Company: ${state.customer?.company}
Plan: ${state.customer?.plan}
Region: ${state.customer?.region}

## Original Ticket
${state.ticket.title}
${state.ticket.description}

## Root Cause (Top Hypothesis — ${topHypothesis?.confidence || 0}% confidence)
${topHypothesis?.title || "Under investigation"}
${topHypothesis?.description || ""}

## Recommended Action
${topHypothesis?.recommendedAction || "Further investigation needed"}

## Knowledge Base Evidence
${formatEvidenceBlock(
  state.knowledgeChunks.slice(0, 3).map((c) => ({
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
  }))
)}

When referencing knowledge base articles in your response, use their citation labels (e.g. [KB-1]) inline.
    `.trim();

    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextSummary },
      ],
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const draftReply = result.body || "";
    const tokenUsage = extractTokenUsage(response);

    logger.info("Response drafted", { subject: result.subject, escalationRecommended: result.escalationRecommended });

    await prisma.investigationRun.update({
      where: { id: state.runId },
      data: { summary: draftReply },
    });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: result,
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
      },
    });

    return { draftReply };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - stepStart },
    });
    logger.error("Response agent failed", { error: msg });
    throw error;
  }
}
