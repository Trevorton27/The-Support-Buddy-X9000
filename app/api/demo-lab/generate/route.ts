import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAuth } from "@/lib/auth";
import { generateScenario, saveGeneratedScenario } from "@/lib/demo-lab/scenario-generator";
import type { GenerateScenarioParams } from "@/lib/demo-lab/scenario-generator";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api-demo-lab-generate");

const generateSchema = z.object({
  mode: z.enum(["generate", "mutate"]),
  service: z.string().optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  category: z.enum(["authentication", "data", "integration", "performance", "configuration"]).optional(),
  sourceTemplateKey: z.string().optional(),
  prompt: z.string().max(500).optional(),
  save: z.boolean().default(true),
});

export async function POST(request: Request) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const params: GenerateScenarioParams = {
    mode: parsed.data.mode,
    service: parsed.data.service,
    severity: parsed.data.severity,
    difficulty: parsed.data.difficulty,
    category: parsed.data.category,
    sourceTemplateKey: parsed.data.sourceTemplateKey,
    prompt: parsed.data.prompt,
  };

  try {
    const scenario = await generateScenario(params);

    if (parsed.data.save) {
      const id = await saveGeneratedScenario(scenario, orgId ?? "");
      return NextResponse.json({ scenario, scenarioId: id });
    }

    return NextResponse.json({ scenario });
  } catch (err) {
    logger.error("Scenario generation failed", { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
