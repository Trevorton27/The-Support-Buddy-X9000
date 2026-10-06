import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage } from "@/lib/agent-utils";
import { getGitSha } from "@/lib/git-sha";
import { runDeterministicChecks } from "@/lib/guardrails-rules";
import { evaluateActionResult, type JevOpsDecision, type JevOpsError } from "@/lib/integrations/jevops/client";
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
    let passed = blockingFlags.length === 0;
    const tokenUsage = extractTokenUsage(response);

    // Step 3: JevOps decision evaluation
    let jevopsDecision: JevOpsDecision | null = null;
    let jevopsError: JevOpsError | null = null;
    try {
      const jevopsResult = await evaluateActionResult({
        agentId: process.env.JEVOPS_AGENT_ID || "30000000-0000-0000-0000-000000000002",
        actionType: "send_customer_reply",
        action: {
          draft_reply: draft,
          ticket_id: state.ticket.id,
          ticket_title: state.ticket.title,
          ticket_severity: state.ticket.severity,
        },
        objective: "Send a customer-facing reply for a support ticket investigation",
        state: {
          investigation_run_id: state.runId,
          hypotheses_count: state.hypotheses.length,
          top_hypothesis_confidence: state.hypotheses[0]?.confidence ?? 0,
          guardrails_passed: passed,
          guardrails_flag_count: flags.length,
          blocking_flag_count: blockingFlags.length,
        },
        evidence: {
          has_incidents: state.incidents.length > 0,
          has_deployments: state.deployments.length > 0,
          knowledge_chunks_used: state.knowledgeChunks?.length ?? 0,
          customer_plan: state.customer?.plan ?? "unknown",
          customer_region: state.customer?.region ?? "unknown",
        },
        correlationId: state.runId,
        idempotencyKey: `guardrails-${state.runId}`,
      });
      if (jevopsResult.ok) jevopsDecision = jevopsResult.data;
      else jevopsError = jevopsResult.error;
    } catch (err) {
      jevopsError = { code: "CLIENT_ERROR", message: err instanceof Error ? err.message : String(err) };
      logger.warn("JevOps evaluation failed, proceeding with local guardrails only", {
        error: jevopsError.message,
      });
    }

    // Merge JevOps disposition with local guardrails
    if (jevopsDecision) {
      if (jevopsDecision.disposition === "block") {
        passed = false;
        flags.push({
          type: "policy" as GuardrailFlag["type"],
          severity: "block",
          description: `JevOps blocked: ${jevopsDecision.policy_trace?.matched_rule ?? "policy rule"}`,
          location: "jevops",
        });
      }
      // "human_review" doesn't override local pass — investigation routes to awaiting_approval anyway
      // "allow" and "retry" don't override local guardrails
    }

    const guardrailsResult: GuardrailsResult = {
      passed,
      flags,
      revisedDraft: semanticResult.revisedDraft,
      ...(jevopsDecision ? { jevopsDecisionId: jevopsDecision.id } : {}),
      ...(jevopsError ? { jevopsError } : {}),
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
