/**
 * Demo Lab Scenario Generator — LLM-powered generation of new bug scenarios.
 *
 * Supports two modes:
 * 1. Mutate: Take an existing template and create a variation
 * 2. Generate: Create a novel scenario from parameters
 */

import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { BUG_TEMPLATES } from "@/lib/bug-generator/templates";

const logger = createLogger("scenario-generator");

// ─── Input Types ───

export interface GenerateScenarioParams {
  mode: "generate" | "mutate";
  service?: string;
  severity?: string;
  difficulty?: string;
  category?: string;
  /** For mutate mode: the key of the template to base the mutation on */
  sourceTemplateKey?: string;
  /** Free-form description of what kind of bug to create */
  prompt?: string;
}

// ─── Output Schema ───

const defectPatchSchema = z.object({
  filePath: z.string(),
  buggyCode: z.string(),
  fixedCode: z.string(),
  testFilePath: z.string(),
  testCode: z.string(),
});

const ticketTemplateSchema = z.object({
  title: z.string(),
  description: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  category: z.string(),
  product: z.string(),
});

const evidenceTemplateSchema = z.object({
  deployment: z.object({
    service: z.string(),
    version: z.string(),
    changedEnvVars: z.array(z.string()),
    notes: z.string(),
  }).optional(),
  logs: z.array(z.unknown()).default([]),
  traces: z.array(z.unknown()).default([]),
});

const scenarioOutputSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  service: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  category: z.enum(["authentication", "data", "integration", "performance", "configuration"]),
  ticketTemplate: ticketTemplateSchema,
  reproductionSteps: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  defectPatch: defectPatchSchema,
  evidenceTemplate: evidenceTemplateSchema,
});

export type GeneratedScenario = z.infer<typeof scenarioOutputSchema>;

// ─── Prompt Building ───

function buildUserPrompt(params: GenerateScenarioParams): string {
  const parts: string[] = [];

  if (params.mode === "mutate" && params.sourceTemplateKey) {
    const source = BUG_TEMPLATES.find((t) => t.id === params.sourceTemplateKey);
    if (source) {
      parts.push(`Create a VARIATION of this existing bug scenario:`);
      parts.push(`Original key: ${source.id}`);
      parts.push(`Original title: ${source.title}`);
      parts.push(`Original description: ${source.description}`);
      parts.push(`Service: ${source.service}`);
      parts.push(`File: ${source.filePath}`);
      parts.push(`Original buggy code: ${source.buggyCode}`);
      parts.push(`Original fixed code: ${source.fixedCode}`);
      parts.push(``);
      parts.push(`The mutation should affect the SAME service and possibly the same file, but introduce a DIFFERENT type of defect. Change the root cause, the symptoms, and the test. The new scenario key must be different from "${source.id}".`);
    }
  } else {
    parts.push(`Generate a NEW bug scenario.`);
  }

  if (params.service) parts.push(`Target service: ${params.service}`);
  if (params.severity) parts.push(`Severity: ${params.severity}`);
  if (params.difficulty) parts.push(`Difficulty: ${params.difficulty}`);
  if (params.category) parts.push(`Category: ${params.category}`);
  if (params.prompt) parts.push(`\nAdditional guidance: ${params.prompt}`);

  // List existing keys to avoid collisions
  const existingKeys = BUG_TEMPLATES.map((t) => t.id);
  parts.push(`\nExisting scenario keys (do NOT reuse): ${existingKeys.join(", ")}`);

  parts.push(`\nReturn ONLY a valid JSON object matching the schema described in the system prompt. Do not wrap in markdown code blocks.`);

  return parts.join("\n");
}

// ─── Generation ───

export async function generateScenario(params: GenerateScenarioParams): Promise<GeneratedScenario> {
  const systemPrompt = readFileSync(
    join(process.cwd(), "agents/prompts/scenario-generator.md"),
    "utf-8"
  );

  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

  logger.info("Generating scenario", { mode: params.mode, service: params.service });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(params) },
    ],
    max_tokens: 4000,
    temperature: 0.8,
  });

  const raw = response.choices[0].message.content;
  if (!raw) throw new Error("Empty response from LLM");

  const parsed = JSON.parse(raw);
  const validated = scenarioOutputSchema.parse(parsed);

  logger.info("Scenario generated", { key: validated.key, service: validated.service });
  return validated;
}

// ─── Persistence ───

export async function saveGeneratedScenario(
  scenario: GeneratedScenario,
  orgId: string
): Promise<string> {
  // Ensure key uniqueness
  const existing = await prisma.demoIssueScenario.findUnique({
    where: { key: scenario.key },
  });
  const key = existing ? `${scenario.key}-${Date.now()}` : scenario.key;

  // Find or default repo URL
  const service = await prisma.productService.findUnique({
    where: { name: scenario.service },
    include: { repository: true },
  });
  const repoUrl = service?.repository
    ? `https://github.com/${service.repository.owner}/${service.repository.repository}`
    : "https://github.com/Trevorton27/support-buddy-demo-product";

  const record = await prisma.demoIssueScenario.create({
    data: {
      key,
      title: scenario.title,
      description: scenario.description,
      repository: repoUrl,
      service: scenario.service,
      severity: scenario.severity,
      difficulty: scenario.difficulty,
      category: scenario.category,
      affectedPaths: JSON.parse(JSON.stringify([
        scenario.defectPatch.filePath,
        scenario.defectPatch.testFilePath,
      ])),
      ticketTemplate: JSON.parse(JSON.stringify(scenario.ticketTemplate)),
      evidenceTemplate: JSON.parse(JSON.stringify(scenario.evidenceTemplate)),
      acceptanceCriteria: JSON.parse(JSON.stringify(scenario.acceptanceCriteria)),
      reproductionSteps: JSON.parse(JSON.stringify(scenario.reproductionSteps)),
      defectPatch: JSON.parse(JSON.stringify(scenario.defectPatch)),
      orgId,
    },
  });

  logger.info("Scenario saved", { id: record.id, key });
  return record.id;
}

// ─── Batch Generation ───

export async function generateMultipleScenarios(
  params: GenerateScenarioParams,
  count: number,
  orgId: string
): Promise<{ generated: number; scenarioIds: string[]; errors: string[] }> {
  const scenarioIds: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const scenario = await generateScenario(params);
      const id = await saveGeneratedScenario(scenario, orgId);
      scenarioIds.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Scenario ${i + 1}: ${msg}`);
      logger.warn("Failed to generate scenario", { index: i, error: msg });
    }
  }

  return { generated: scenarioIds.length, scenarioIds, errors };
}
