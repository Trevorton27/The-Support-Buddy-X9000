/**
 * Demo Lab Defect Author — dispatches Devin to create novel defects in the demo product.
 *
 * Flow:
 * 1. User configures defect parameters via wizard UI
 * 2. API creates a DevinTask with mode "defect_author"
 * 3. Inngest orchestrates the Devin session
 * 4. On completion, parses the manifest from the PR and creates a DemoIssueScenario
 */

import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { createLogger } from "@/lib/logger";

const logger = createLogger("defect-author");

// ─── Input Types ───

export interface DefectAuthorParams {
  service: string;
  defectClass: string;
  difficulty: "easy" | "medium" | "hard";
  allowedPaths?: string[];
  guidance?: string;
}

const DEFECT_CLASSES = [
  "off-by-one",
  "missing-null-check",
  "wrong-default",
  "race-condition",
  "stale-cache",
  "incorrect-comparison",
  "missing-validation",
  "wrong-error-handling",
  "hardcoded-value",
  "type-coercion",
] as const;

export type DefectClass = typeof DEFECT_CLASSES[number];

export function getDefectClasses(): readonly string[] {
  return DEFECT_CLASSES;
}

// ─── Manifest Schema ───

export const defectManifestSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  service: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  category: z.enum(["authentication", "data", "integration", "performance", "configuration"]),
  filePath: z.string(),
  buggyCode: z.string(),
  fixedCode: z.string(),
  testFilePath: z.string(),
  ticketTemplate: z.object({
    title: z.string(),
    description: z.string(),
    severity: z.enum(["critical", "high", "medium", "low"]),
    category: z.string(),
    product: z.string(),
  }),
  reproductionSteps: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
});

export type DefectManifest = z.infer<typeof defectManifestSchema>;

// ─── Prompt Building ───

export function buildDefectAuthorPrompt(params: DefectAuthorParams): string {
  const systemPrompt = readFileSync(
    join(process.cwd(), "agents/prompts/devin-defect-author.md"),
    "utf-8"
  );

  const parts: string[] = [systemPrompt, ""];
  parts.push(`## PARAMETERS`);
  parts.push(`- Target service: ${params.service}`);
  parts.push(`- Defect class: ${params.defectClass}`);
  parts.push(`- Difficulty: ${params.difficulty}`);

  if (params.allowedPaths?.length) {
    parts.push(`- Allowed file paths (only modify files in these directories):`);
    for (const p of params.allowedPaths) {
      parts.push(`  - ${p}`);
    }
  }

  if (params.guidance) {
    parts.push(`\n## ADDITIONAL GUIDANCE\n${params.guidance}`);
  }

  return parts.join("\n");
}

// ─── Task Dispatch ───

export async function dispatchDefectAuthor(
  params: DefectAuthorParams,
  userId: string,
  orgId: string
): Promise<{ taskId: string }> {
  // Resolve repository
  const service = await prisma.productService.findUnique({
    where: { name: params.service },
    include: { repository: true },
  });

  const repoSlug = service?.repository
    ? `${service.repository.owner}/${service.repository.repository}`
    : "Trevorton27/support-buddy-demo-product";

  const prompt = buildDefectAuthorPrompt(params);

  const task = await prisma.devinTask.create({
    data: {
      orgId,
      repository: repoSlug,
      mode: "defect_author",
      status: "queued",
      promptSnapshot: JSON.parse(JSON.stringify({
        prompt,
        params,
      })),
      createdBy: userId,
    },
  });

  await inngest.send({
    name: "devin/task.created",
    data: { devinTaskId: task.id, orgId },
  });

  logger.info("Defect author task dispatched", {
    taskId: task.id,
    service: params.service,
    defectClass: params.defectClass,
  });

  return { taskId: task.id };
}

// ─── Manifest Parsing & Scenario Creation ───

export async function processDefectManifest(
  taskId: string
): Promise<{ scenarioId: string | null; error?: string }> {
  const task = await prisma.devinTask.findUniqueOrThrow({ where: { id: taskId } });

  if (task.status !== "finished") {
    return { scenarioId: null, error: `Task not finished: ${task.status}` };
  }

  // Try to extract manifest from structured result
  const result = task.structuredResult as Record<string, unknown> | null;
  if (!result) {
    return { scenarioId: null, error: "No structured result from Devin" };
  }

  // The manifest might be in the structured output or we need to fetch from the PR
  // First, try to parse manifest from the PR if available
  let manifest: DefectManifest | null = null;

  if (result.manifest) {
    const parsed = defectManifestSchema.safeParse(result.manifest);
    if (parsed.success) {
      manifest = parsed.data;
    }
  }

  // Fallback: try to extract from structured result fields
  if (!manifest && result.key && result.title) {
    const parsed = defectManifestSchema.safeParse(result);
    if (parsed.success) {
      manifest = parsed.data;
    }
  }

  if (!manifest) {
    return { scenarioId: null, error: "Could not parse defect manifest from Devin output" };
  }

  // Create the DemoIssueScenario from the manifest
  const existing = await prisma.demoIssueScenario.findUnique({
    where: { key: manifest.key },
  });
  const key = existing ? `${manifest.key}-${Date.now()}` : manifest.key;

  const repoUrl = `https://github.com/${task.repository}`;

  const scenario = await prisma.demoIssueScenario.create({
    data: {
      key,
      title: manifest.title,
      description: manifest.description,
      repository: repoUrl,
      service: manifest.service,
      severity: manifest.severity,
      difficulty: manifest.difficulty,
      category: manifest.category,
      affectedPaths: JSON.parse(JSON.stringify([manifest.filePath, manifest.testFilePath])),
      ticketTemplate: JSON.parse(JSON.stringify(manifest.ticketTemplate)),
      evidenceTemplate: JSON.parse(JSON.stringify({ deployment: null, logs: [], traces: [] })),
      acceptanceCriteria: JSON.parse(JSON.stringify(manifest.acceptanceCriteria)),
      reproductionSteps: JSON.parse(JSON.stringify(manifest.reproductionSteps)),
      defectPatch: JSON.parse(JSON.stringify({
        buggyCode: manifest.buggyCode,
        fixedCode: manifest.fixedCode,
        filePath: manifest.filePath,
        testFilePath: manifest.testFilePath,
      })),
      orgId: task.orgId,
    },
  });

  logger.info("Scenario created from Devin defect", {
    scenarioId: scenario.id,
    key,
    taskId,
  });

  return { scenarioId: scenario.id };
}
