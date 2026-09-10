/**
 * Devin Webhook Processing — verifies signatures and processes session status updates.
 *
 * Replaces polling with real-time updates. When a Devin session changes state,
 * this handler updates the corresponding DevinTask and (if linked) the DemoRun.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { mapDevinStatusToInternal, TERMINAL_STATUSES } from "@/lib/integrations/devin/types";
import type { DevinSession } from "@/lib/integrations/devin/types";
import { parseDevinResult } from "@/lib/integrations/devin/result-parser";
import { transitionRun } from "@/lib/demo-lab/lifecycle";
import { transitionWorkItem } from "@/lib/work-items";

const logger = createLogger("webhook-devin");

// ─── Signature Verification ───

export function verifyDevinSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Webhook Payload ───

interface DevinWebhookPayload {
  event_type: string;
  session_id: string;
  status: string;
  session?: DevinSession;
  pull_request?: { url: string };
  structured_output?: Record<string, unknown>;
}

// ─── Event Processing ───

export async function processDevinWebhook(
  payload: DevinWebhookPayload
): Promise<{ processed: boolean; detail?: string }> {
  const { session_id, status, event_type } = payload;

  // Find the DevinTask by session ID
  const task = await prisma.devinTask.findUnique({
    where: { devinSessionId: session_id },
  });

  if (!task) {
    return { processed: false, detail: `No task found for session: ${session_id}` };
  }

  logger.info("Devin webhook received", {
    eventType: event_type,
    sessionId: session_id,
    taskId: task.id,
    currentStatus: task.status,
    newStatus: status,
  });

  // Build a minimal DevinSession from webhook data for status mapping
  const sessionData: DevinSession = payload.session ?? {
    session_id,
    status_enum: status,
    messages: [],
    tags: [],
    created_at: task.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
    pull_request: payload.pull_request,
    structured_output: payload.structured_output,
  };

  const internalStatus = mapDevinStatusToInternal(status, sessionData);
  const isTerminal = TERMINAL_STATUSES.includes(internalStatus);
  const statusChanged = internalStatus !== task.status;

  // Update the DevinTask
  await prisma.devinTask.update({
    where: { id: task.id },
    data: {
      status: internalStatus,
      pullRequestUrl: payload.pull_request?.url ?? task.pullRequestUrl,
      structuredResult: payload.structured_output
        ? JSON.parse(JSON.stringify(payload.structured_output))
        : task.structuredResult,
      lastPolledAt: new Date(),
      ...(isTerminal ? { completedAt: new Date() } : {}),
    },
  });

  // Log status change on WorkItem
  if (statusChanged && task.workItemId) {
    await prisma.workItemEvent.create({
      data: {
        workItemId: task.workItemId,
        eventType: "devin_status_changed",
        actorType: "ai",
        newValue: JSON.parse(JSON.stringify({
          devinStatus: internalStatus,
          devinSessionStatus: status,
          source: "webhook",
        })),
      },
    });
  }

  // On terminal status, parse final result
  if (isTerminal) {
    await finalizeDevinTask(task.id, sessionData);
  }

  // Update linked DemoRun if applicable
  await updateLinkedDemoRun(task.id, internalStatus, payload.pull_request?.url);

  return {
    processed: true,
    detail: `Task ${task.id}: ${task.status} → ${internalStatus}${isTerminal ? " (terminal)" : ""}`,
  };
}

// ─── Finalization ───

async function finalizeDevinTask(taskId: string, session: DevinSession): Promise<void> {
  const task = await prisma.devinTask.findUniqueOrThrow({ where: { id: taskId } });
  if (task.status === "cancelled") return;

  const parsed = parseDevinResult(session, task.mode as "reproduce" | "fix");

  await prisma.devinTask.update({
    where: { id: taskId },
    data: {
      verdict: parsed.verdict,
      verdictReason: parsed.verdictReason,
      pullRequestUrl: parsed.pullRequestUrl ?? task.pullRequestUrl,
      structuredResult: JSON.parse(JSON.stringify(parsed)),
      status: task.status === "working" ? "finished" : task.status,
    },
  });

  // Complete WorkItem
  if (task.workItemId) {
    try {
      await transitionWorkItem(
        task.workItemId, "COMPLETED", undefined, "ai",
        `Devin ${task.mode}: ${parsed.verdict} (via webhook)`
      );
    } catch { /* may already be completed/cancelled */ }
  }

  logger.info("Devin task finalized via webhook", {
    taskId,
    verdict: parsed.verdict,
    mode: task.mode,
  });
}

// ─── Demo Run Sync ───

async function updateLinkedDemoRun(
  taskId: string,
  devinStatus: string,
  prUrl?: string
): Promise<void> {
  // Find a DemoRun that references this task
  const run = await prisma.demoRun.findFirst({
    where: {
      OR: [
        { devinReproduceId: taskId },
        { devinFixId: taskId },
      ],
      status: { notIn: ["completed", "failed"] },
    },
  });

  if (!run) return;

  const isReproduce = run.devinReproduceId === taskId;
  const isFix = run.devinFixId === taskId;

  if (devinStatus === "finished") {
    if (isReproduce && run.status === "devin_reproducing") {
      // Reproduce finished — the orchestration function will pick this up
      // and dispatch the fix. We just log it here.
      logger.info("Devin reproduce finished (webhook), orchestrator will continue", { runId: run.id });
    }

    if (isFix && run.status === "devin_fixing") {
      if (prUrl) {
        await transitionRun(run.id, "pr_ready", `PR ready: ${prUrl}`, {
          pullRequestUrl: prUrl,
        });
      }
    }
  }

  if (devinStatus === "failed" || devinStatus === "expired") {
    const phase = isReproduce ? "reproduce" : "fix";
    logger.warn(`Devin ${phase} ${devinStatus} (webhook)`, { runId: run.id, taskId });
    // Don't transition to failed here — let the orchestration function handle it
    // to avoid race conditions with the polling loop.
  }
}
