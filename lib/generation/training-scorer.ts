import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import type { TrainingScores, TrainingScoreInput } from "./types";

export async function scoreTrainingRun(input: TrainingScoreInput): Promise<TrainingScores> {
  const systemPrompt = readFileSync(
    join(process.cwd(), "agents/prompts/training-judge.md"),
    "utf-8"
  );

  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

  const userContent = `
## Training Evaluation Input

### Ticket
Title: ${input.ticketTitle}
Description: ${input.ticketDescription}

### Hidden Ground Truth
True Root Cause: ${input.trueRootCause}
True Severity: ${input.trueSeverity}
Injected Faults (red herrings): ${input.injectedFaults.length > 0 ? input.injectedFaults.join("; ") : "none"}
Difficulty: ${input.difficulty}

### AI Investigation Output
Top Hypothesis: ${input.actualTopHypothesis}
Severity Classification: ${input.actualSeverityClassification}
All Hypotheses:
${input.hypotheses.map((h, i) => `${i + 1}. [${h.confidence}%] ${h.title}\n   Evidence: ${h.evidence.slice(0, 3).join(", ")}`).join("\n")}
`.trim();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const result = JSON.parse(response.choices[0].message.content || "{}") as Record<string, unknown>;

  const rootCauseScore = clamp(result.rootCauseScore);
  const severityScore = clamp(result.severityScore);
  const deceptionResistanceScore = clamp(result.deceptionResistanceScore);

  // Weighted: rootCause 40%, severity 20%, deception 40%
  const overallScore = rootCauseScore * 0.4 + severityScore * 0.2 + deceptionResistanceScore * 0.4;

  return {
    rootCauseScore,
    severityScore,
    deceptionResistanceScore,
    overallScore,
    passed: overallScore >= 0.7,
    reasoning: typeof result.reasoning === "string" ? result.reasoning : "",
  };
}

function clamp(val: unknown, fallback = 0): number {
  if (typeof val === "number") return Math.min(1, Math.max(0, val));
  return fallback;
}
