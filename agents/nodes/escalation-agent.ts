import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage, getGitSha } from "@/lib/agent-utils";
import { postEscalation } from "../tools/escalation-tool";
import type { InvestigationState } from "../state";

const logger = createLogger("escalation-agent");

export async function escalationAgent(
  state: InvestigationState
): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = "gpt-4o";
  const promptFile = "escalation.md";
  const systemPrompt = readFileSync(join(process.cwd(), `agents/prompts/${promptFile}`), "utf-8");

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "escalation",
      status: "running",
      input: { severity: state.ticket.severity, promptFile, gitSha: getGitSha() },
    },
  });

  try {

    const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

    const contextSummary = `
## Ticket
${state.ticket.title}
${state.ticket.description}
Severity: ${state.ticket.severity}

## Customer
${state.customer?.name} at ${state.customer?.company} (${state.customer?.plan} plan, ${state.customer?.region})

## Root Cause Hypotheses
${state.hypotheses.map((h, i) => `${i + 1}. [${h.confidence}%] ${h.title}: ${h.description}`).join("\n")}

## Related Incidents
${state.incidents.map((i) => `- ${i.id}: ${i.title}`).join("\n") || "None"}

## Related Deployments
${state.deployments.slice(0, 3).map((d) => `- ${d.id}: ${d.service} ${d.version} at ${d.timestamp}`).join("\n") || "None"}

## Ticket Created
${state.ticket.createdAt.toISOString()}
    `.trim();

    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextSummary },
      ],
    });

    const escalationData = JSON.parse(response.choices[0].message.content || "{}");
    const escalationNote = JSON.stringify(escalationData, null, 2);
    const tokenUsage = extractTokenUsage(response);

    const externalResult = await postEscalation({
      title: escalationData.title || state.ticket.title,
      severity: escalationData.severity || state.ticket.severity,
      priority: escalationData.priority || "P2",
      body: escalationNote,
      labels: ["escalation", "agent-generated"],
    });

    const outputData = { ...escalationData, externalUrl: externalResult.url, externalId: externalResult.id };
    logger.info("Escalation note generated", { priority: escalationData.priority, externalUrl: externalResult.url });

    await prisma.investigationRun.update({
      where: { id: state.runId },
      data: { escalationNote },
    });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: outputData,
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
      },
    });

    return { escalationNote };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - stepStart },
    });
    logger.error("Escalation agent failed", { error: msg });
    throw error;
  }
}
