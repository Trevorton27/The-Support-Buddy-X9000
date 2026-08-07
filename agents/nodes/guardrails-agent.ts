import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage } from "@/lib/agent-utils";
import { getGitSha } from "@/lib/git-sha";
import { runDeterministicChecks } from "@/lib/guardrails-rules";
import type { InvestigationState, GuardrailFlag, GuardrailsResult } from "../state";

const logger = createLogger("guardrails-agent");

export async function guardrailsAgent(
  state: InvestigationState
): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = "gpt-4o-mini";
  const promptFile = "guardrails.md";
  const systemPrompt = readFileSync(join(process.cwd(), `agents/prompts/${promptFile}`), "utf-8");

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "guardrails",
      status: "running",
      input: { draftLength: state.draftReply.length, promptFile, gitSha: getGitSha() },
    },
  });

  try {
    const draft = state.draftReply;
    const flags: GuardrailFlag[] = [];

    // Step 1: Deterministic regex checks (always run, free)
    const deterministicFlags = runDeterministicChecks(draft);
    flags.push(...deterministicFlags);

    // Step 2: LLM semantic check (unsupported claims, internal leakage, low confidence)

    const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `## Draft Customer Reply\n${draft}\n\n## Context\nTicket: ${state.ticket.title}\nTop hypothesis confidence: ${state.hypotheses[0]?.confidence ?? 0}%`,
        },
      ],
    });

    const semanticResult = JSON.parse(response.choices[0].message.content || "{}") as {
      flags?: Array<{ type: string; severity: string; description: string; location: string }>;
      revisedDraft?: string;
    };

    if (Array.isArray(semanticResult.flags)) {
      for (const f of semanticResult.flags) {
        flags.push({
          type: f.type as GuardrailFlag["type"],
          severity: f.severity as GuardrailFlag["severity"],
          description: f.description,
          location: f.location,
        });
      }
    }

    const blockingFlags = flags.filter((f) => f.severity === "block");
    const passed = blockingFlags.length === 0;
    const tokenUsage = extractTokenUsage(response);

    const guardrailsResult: GuardrailsResult = {
      passed,
      flags,
      revisedDraft: semanticResult.revisedDraft,
    };

    logger.info("Guardrails check complete", {
      passed,
      flagCount: flags.length,
      blockingCount: blockingFlags.length,
    });

    // Update the run with guardrails results
    await prisma.investigationRun.update({
      where: { id: state.runId },
      data: {
        guardrailsPassed: passed,
        guardrailsResult: JSON.parse(JSON.stringify(guardrailsResult)),
      },
    });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: JSON.parse(JSON.stringify(guardrailsResult)),
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
      },
    });

    return { guardrailsResult };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: msg, completedAt: new Date(), durationMs: Date.now() - stepStart },
    });
    logger.error("Guardrails agent failed", { error: msg });
    throw error;
  }
}
