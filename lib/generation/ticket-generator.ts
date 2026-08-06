import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { GenerationParams, GeneratedTicketDraft, IncidentScenario } from "./types";

const logger = createLogger("ticket-generator");

function buildUserPrompt(params: GenerationParams): string {
  const { mode, count, products, categories, severityWeights, realism, incidentScenario } = params;

  const weightStr = Object.entries(severityWeights)
    .filter(([, w]) => w > 0)
    .map(([s, w]) => `${s}: ${w}%`)
    .join(", ");

  let prompt = `Generate ${count} support tickets.\n\n`;
  prompt += `Mode: ${mode}\n`;
  prompt += `Products to use: ${products.join(", ")}\n`;
  prompt += `Categories to use: ${categories.join(", ")}\n`;
  prompt += `Severity distribution: ${weightStr}\n\n`;

  if (realism.misleadingLogs) {
    prompt += `Realism: Include misleading log lines or error codes in descriptions.\n`;
  }
  if (realism.noiseLevel !== "none") {
    prompt += `Noise level: ${realism.noiseLevel} — add ${realism.noiseLevel === "high" ? "many" : "some"} irrelevant context details.\n`;
  }
  if (realism.herringCount > 0) {
    prompt += `Inject exactly ${realism.herringCount} red herring fault(s) per ticket and list them in injectedFaults[]. Distribute difficulty across easy/medium/hard.\n`;
  }

  if (mode === "autonomous") {
    prompt += `\nAutonomous mode: Maximize variety — different products, root causes, customer writing styles. Aim for realistic edge cases and complex multi-component failures.\n`;
  }

  if (mode === "incident" && incidentScenario) {
    prompt += `\nIncident Scenario: "${incidentScenario.name}"\n`;
    prompt += `Description: ${incidentScenario.description}\n`;
    prompt += `Affected products: ${incidentScenario.products.join(", ")}\n`;
    prompt += `Region: ${incidentScenario.region}\n`;
    prompt += `True root cause (hidden): ${incidentScenario.rootCause}\n`;
    prompt += `Generate exactly ${incidentScenario.ticketCount} tickets from different customer perspectives. `;
    prompt += `Assign scenarioRole as: first ticket = "trigger", middle tickets = "symptom", last ticket = "related". `;
    prompt += `All tickets share the same root cause but describe symptoms differently.\n`;
  }

  prompt += `\nReturn ONLY a valid JSON array with ${count} ticket objects.`;
  return prompt;
}

export async function generateTicketBatch(
  params: GenerationParams,
  batchId: string
): Promise<GeneratedTicketDraft[]> {
  const systemPrompt = readFileSync(
    join(process.cwd(), "agents/prompts/ticket-generator.md"),
    "utf-8"
  );

  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

  logger.info("Generating ticket batch", { batchId, count: params.count, mode: params.mode });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${buildUserPrompt(params)}\n\nWrap the array in a JSON object: { "tickets": [...] }`,
      },
    ],
    max_tokens: 4000,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}") as {
    tickets?: unknown[];
  };

  const tickets = Array.isArray(raw.tickets) ? raw.tickets : [];

  logger.info("Ticket batch generated", { batchId, generated: tickets.length });

  return tickets.map((t) => {
    const ticket = t as Record<string, unknown>;
    return {
      title: String(ticket.title ?? "Untitled ticket"),
      description: String(ticket.description ?? ""),
      category: String(ticket.category ?? "Infrastructure"),
      product: String(ticket.product ?? "API Gateway"),
      severity: String(ticket.severity ?? "medium"),
      trueRootCause: String(ticket.trueRootCause ?? "Unknown"),
      trueCategory: String(ticket.trueCategory ?? ticket.category ?? "Infrastructure"),
      trueSeverity: String(ticket.trueSeverity ?? ticket.severity ?? "medium"),
      affectedProduct: String(ticket.affectedProduct ?? ticket.product ?? "API Gateway"),
      injectedFaults: Array.isArray(ticket.injectedFaults)
        ? (ticket.injectedFaults as unknown[]).map(String)
        : [],
      difficulty: (["easy", "medium", "hard"].includes(String(ticket.difficulty))
        ? ticket.difficulty
        : "medium") as "easy" | "medium" | "hard",
      scenarioRole: (["trigger", "symptom", "related"].includes(String(ticket.scenarioRole))
        ? ticket.scenarioRole
        : undefined) as "trigger" | "symptom" | "related" | undefined,
    };
  });
}

export async function generateIncidentScenario(
  scenario: IncidentScenario,
  batchId: string
): Promise<GeneratedTicketDraft[]> {
  const params: GenerationParams = {
    mode: "incident",
    count: scenario.ticketCount,
    products: scenario.products,
    categories: ["Infrastructure", "Performance", "API"],
    severityWeights: { critical: 30, high: 50, medium: 20, low: 0 },
    orgId: "",
    realism: { misleadingLogs: true, noiseLevel: "medium", herringCount: 1 },
    incidentScenario: scenario,
  };
  return generateTicketBatch(params, batchId);
}
