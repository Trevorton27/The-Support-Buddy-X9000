import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { extractTokenUsage } from "@/lib/agent-utils";
import { getGitSha } from "@/lib/git-sha";
import type { InvestigationState } from "../state";

const logger = createLogger("intake-agent");

const ZERO_SHOT_LABELS = [
  "authentication",
  "database",
  "billing",
  "api",
  "performance",
  "webhook",
  "rate-limiting",
  "deployment",
];

async function getHfUrgencyScore(text: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: text.slice(0, 512) }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<Array<{ label: string; score: number }>>;
    console.log("[HF intake] urgency raw response from distilbert-base-uncased-finetuned-sst-2-english:", JSON.stringify(data));
    const labels = data[0];
    if (!Array.isArray(labels)) return null;
    const neg = labels.find((l) => l.label === "NEGATIVE");
    // NEGATIVE score maps directly to urgency (0 = calm, 1 = very urgent)
    return neg ? Math.round(neg.score * 100) / 100 : null;
  } catch {
    return null;
  }
}

async function getHfTopicHint(text: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/facebook/bart-large-mnli",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: text.slice(0, 512),
          parameters: { candidate_labels: ZERO_SHOT_LABELS },
        }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { labels: string[]; scores: number[] };
    console.log("[HF intake] topic hint raw response from facebook/bart-large-mnli:", JSON.stringify(data));
    if (!Array.isArray(data.labels) || data.labels.length === 0) return null;
    return data.labels[0]; // highest-scoring label
  } catch {
    return null;
  }
}

export async function intakeAgent(state: InvestigationState): Promise<Partial<InvestigationState>> {
  const stepStart = Date.now();
  const model = "gpt-4o-mini";
  const promptFile = "intake.md";
  const systemPrompt = readFileSync(join(process.cwd(), `agents/prompts/${promptFile}`), "utf-8");

  const step = await prisma.agentStep.create({
    data: {
      investigationRunId: state.runId,
      agentName: "intake",
      status: "running",
      input: { ticketId: state.ticketId, title: state.ticket.title, promptFile, gitSha: getGitSha() },
    },
  });

  try {

    const env = getEnv();
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const hfKey = env.HUGGING_FACE_API_KEY;

    const ticketText = `${state.ticket.title}\n\n${state.ticket.description}`;

    // HF enrichment — both calls in parallel, both silently fail-safe
    const [urgencyScore, topicHint] = hfKey
      ? await Promise.all([
          getHfUrgencyScore(ticketText, hfKey),
          getHfTopicHint(ticketText, hfKey),
        ])
      : [null, null];

    if (urgencyScore !== null) logger.info("HF urgency score", { urgencyScore });
    if (topicHint) logger.info("HF topic hint", { topicHint });

    const topicContext = topicHint
      ? `\n\nPre-classification hint (from zero-shot model): likely category is "${topicHint}".`
      : "";

    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Ticket Title: ${state.ticket.title}\n\nTicket Description: ${state.ticket.description}${topicContext}`,
        },
      ],
    });

    const classification = JSON.parse(response.choices[0].message.content || "{}");
    const tokenUsage = extractTokenUsage(response);
    logger.info("Intake classification complete", { classification });

    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "complete",
        output: { ...classification, urgencyScore, topicHint },
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
        tokenUsage: tokenUsage ? JSON.parse(JSON.stringify(tokenUsage)) : null,
      },
    });

    return { classification, urgencyScore };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "failed",
        errorMessage: msg,
        completedAt: new Date(),
        durationMs: Date.now() - stepStart,
      },
    });
    logger.error("Intake agent failed", { error: msg });
    throw error;
  }
}
