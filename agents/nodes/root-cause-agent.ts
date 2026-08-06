import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage, getGitSha } from "@/lib/agent-utils";
import { formatEvidenceBlock } from "@/lib/knowledge-retrieval";
import type { InvestigationState, Hypothesis } from "../state";

const logger = createLogger("root-cause-agent");

export async function rootCauseAgent(
  state: InvestigationState
): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = state.evalModel ?? "gpt-4o";
  const promptFile = "root-cause.md";
  const systemPrompt = readFileSync(join(process.cwd(), `agents/prompts/${promptFile}`), "utf-8");

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "root-cause",
      status: "running",
      input: {
        hasLogs: state.logs.length > 0,
        hasIncidents: state.incidents.length > 0,
        hasDeployments: state.deployments.length > 0,
        hasKnowledge: state.knowledgeChunks.length > 0,
        promptFile,
        gitSha: getGitSha(),
        model,
      },
    },
  });

  try {

    const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

    const contextSummary = `
## Ticket
${state.ticket.title}
${state.ticket.description}

## Classification
${JSON.stringify(state.classification, null, 2)}

## Customer Context
Name: ${state.customer?.name}, Company: ${state.customer?.company}
Plan: ${state.customer?.plan}, Region: ${state.customer?.region}

## Recent Logs (sample)
${state.logs.slice(0, 10).map((l) => `[${l.timestamp}] ${l.level} ${l.service}: ${l.message}`).join("\n")}

## Related Incidents
${state.incidents.map((i) => `- ${i.title} (${i.status}): ${i.rootCause}`).join("\n") || "None found"}

## Recent Deployments (within 48h)
${state.deployments.slice(0, 5).map((d) => `- ${d.service} ${d.version} at ${d.timestamp}: ${d.notes}`).join("\n") || "None found"}

## Knowledge Base Evidence
${formatEvidenceBlock(
  state.knowledgeChunks.slice(0, 5).map((c) => ({
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
    const hypotheses: Hypothesis[] = result.hypotheses || [];
    const tokenUsage = extractTokenUsage(response);

    logger.info("Root cause analysis complete", {
      hypothesesCount: hypotheses.length,
      topConfidence: hypotheses[0]?.confidence,
    });

    await prisma.investigationRun.update({
      where: { id: state.runId },
      data: { hypotheses: JSON.parse(JSON.stringify(hypotheses)) },
    });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: result,
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
        confidenceScore: hypotheses[0]?.confidence ? hypotheses[0].confidence / 100 : null,
      },
    });

    return { hypotheses };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - stepStart },
    });
    logger.error("Root cause agent failed", { error: msg });
    throw error;
  }
}
