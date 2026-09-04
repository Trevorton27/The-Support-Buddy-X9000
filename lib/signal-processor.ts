// Signal Processor — action extraction + reconciliation
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createWorkItem } from "@/lib/work-items";
import { createLogger } from "@/lib/logger";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const logger = createLogger("signal-processor");

const extractionSchema = z.object({
  type: z.enum([
    "CUSTOMER_REPLY", "INTERNAL_FOLLOW_UP", "INVESTIGATION", "ESCALATION",
    "APPROVAL", "INCIDENT_UPDATE", "SCHEDULED_CHECK", "DOCUMENTATION", "MANUAL_TASK",
  ]),
  title: z.string().max(200),
  summary: z.string().max(500),
  requiredAction: z.string().optional(),
  priorityContext: z.object({
    severity: z.enum(["critical", "high", "medium", "low"]).optional(),
    customerTier: z.enum(["enterprise", "pro", "free"]).optional(),
    blockedParty: z.enum(["customer", "internal", "none"]).optional(),
    sentiment: z.enum(["frustrated", "neutral", "positive"]).optional(),
  }).optional(),
  confidence: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

export async function extractAction(signal: {
  eventType: string;
  payload: unknown;
  evidence?: string | null;
  sourceSystem: string;
}): Promise<ExtractionResult> {
  const env = getEnv();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const promptPath = join(process.cwd(), "agents/prompts/action-extraction.md");
  const systemPrompt = readFileSync(promptPath, "utf-8");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          sourceSystem: signal.sourceSystem,
          eventType: signal.eventType,
          payload: signal.payload,
          evidence: signal.evidence,
        }),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");
  const parsed = extractionSchema.safeParse(raw);

  if (!parsed.success) {
    logger.warn("Extraction failed validation, defaulting to MANUAL_TASK", { errors: parsed.error.flatten() });
    return {
      type: "MANUAL_TASK",
      title: `Unclassified: ${signal.eventType}`,
      summary: `Signal from ${signal.sourceSystem} could not be automatically classified.`,
      confidence: 0.2,
    };
  }

  return parsed.data;
}

export async function reconcileSignal(
  signalId: string,
  extraction: ExtractionResult,
  orgId: string
) {
  const signal = await prisma.workSignal.findUniqueOrThrow({ where: { id: signalId } });

  // Check idempotency — if already processed, skip
  if (signal.processingStatus === "processed") {
    logger.info("Signal already processed, skipping", { signalId });
    return null;
  }

  // Try to find existing work item by ticket/source
  const payload = signal.payload as Record<string, unknown>;
  const ticketId = (payload?.ticketId as string) || null;

  let existingItem = null;
  if (ticketId) {
    existingItem = await prisma.workItem.findFirst({
      where: {
        orgId,
        ticketId,
        type: extraction.type,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    });
  }

  let workItemId: string;

  if (existingItem) {
    // Update existing item if priority increased
    workItemId = existingItem.id;
    logger.info("Reconciled to existing work item", { signalId, workItemId });
  } else {
    // Create new work item
    const status = extraction.confidence < 0.6 ? "NEEDS_CLASSIFICATION" : "OPEN";
    const item = await createWorkItem({
      orgId,
      type: extraction.type,
      title: extraction.title,
      summary: extraction.summary,
      requiredAction: extraction.requiredAction,
      confidence: extraction.confidence,
      ticketId: ticketId || undefined,
      status,
      priorityContext: extraction.priorityContext,
      actorType: "ai",
    });
    workItemId = item.id;
    logger.info("Created new work item from signal", { signalId, workItemId, status });
  }

  // Mark signal as processed
  await prisma.workSignal.update({
    where: { id: signalId },
    data: {
      processingStatus: "processed",
      processedAt: new Date(),
      workItemId,
      extractionResult: JSON.parse(JSON.stringify(extraction)),
    },
  });

  return workItemId;
}
