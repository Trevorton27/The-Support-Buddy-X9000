import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage, getGitSha } from "@/lib/agent-utils";
import { fetchLogs, fetchTraces } from "../tools/logs-tool";
import { getDatadogAdapter } from "@/lib/integrations/datadog";
import type { InvestigationState } from "../state";

const logger = createLogger("log-analysis-agent");

export async function logAnalysisAgent(
  state: InvestigationState
): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = "gpt-4o-mini";
  const promptFile = "log-analysis.md";
  const systemPrompt = readFileSync(join(process.cwd(), `agents/prompts/${promptFile}`), "utf-8");

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "log-analysis",
      status: "running",
      input: { customerId: state.ticket.customerId, promptFile, gitSha: getGitSha() },
    },
  });

  try {
    const logs = fetchLogs({ customerId: state.ticket.customerId });
    const traces = fetchTraces(state.ticket.customerId);

    // Phase 5: Supplement with Datadog logs if available
    const ddAdapter = getDatadogAdapter();
    const ddLogs = ddAdapter.getLogs();

    const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

    const logsText = logs.slice(0, 20).map((l) =>
      `[${l.timestamp}] ${l.level} ${l.service}: ${l.message} ${JSON.stringify(l.metadata || {})}`
    ).join("\n");

    const tracesText = traces.slice(0, 15).map((t) =>
      `${t.service} → ${t.operation}: ${t.duration}ms [${t.status}]`
    ).join("\n");

    const ddText = ddLogs.slice(0, 5).map((l) =>
      `[DATADOG] ${l.timestamp} ${l.level} ${l.service}: ${l.message}`
    ).join("\n");

    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Ticket: ${state.ticket.title}\n\nLogs:\n${logsText}\n\nTraces:\n${tracesText}\n\nDatadog:\n${ddText}`,
        },
      ],
    });

    const analysis = JSON.parse(response.choices[0].message.content || "{}");
    const tokenUsage = extractTokenUsage(response);
    logger.info("Log analysis complete", { errorPatterns: analysis.errorPatterns?.length });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: { ...analysis, logCount: logs.length, traceCount: traces.length, datadogCount: ddLogs.length },
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
      },
    });

    return { logs, traces };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - stepStart },
    });
    logger.error("Log analysis agent failed", { error: msg });
    throw error;
  }
}
