import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runInvestigation } from "@/agents/graph";
import { suggestClusters } from "@/lib/incident-clustering";
import { getSlackAdapter } from "@/lib/integrations/slack";
import { createLogger } from "@/lib/logger";
import { generateTicketBatch } from "@/lib/generation/ticket-generator";
import type { GenerationParams } from "@/lib/generation/types";
import { extractAction, reconcileSignal } from "@/lib/signal-processor";
import { calculatePriority } from "@/lib/priority-engine";
import { createWorkItem, resumeWorkItem, completeWorkItem, transitionWorkItem } from "@/lib/work-items";
import { refreshWorkContext } from "@/lib/work-context";
import { generateBriefing } from "@/lib/shift-briefing";
import { getDevinAdapter } from "@/lib/integrations/devin";
import { mapDevinStatusToInternal } from "@/lib/integrations/devin/types";
import { parseDevinResult } from "@/lib/integrations/devin/result-parser";

const logger = createLogger("inngest-function");

// Phase 3: HITL Approval — restructured with step.waitForEvent
export const runInvestigationFunction = inngest.createFunction(
  {
    id: "run-investigation",
    name: "Run Support Ticket Investigation",
    retries: 2,
    timeouts: { finish: "72h" }, // Extended for HITL 72h wait window
  },
  { event: "investigation/run.requested" },
  async ({ event, step }) => {
    const { ticketId, runId } = event.data as { ticketId: string; runId: string };

    logger.info("Inngest function triggered", { ticketId, runId });

    // Step 1: Run the full investigation graph (all agents including guardrails)
    await step.run("execute-investigation-graph", async () => {
      await runInvestigation(ticketId, runId);
    });

    // Step 1.5: Check if user paused/cancelled while graph was running
    const shouldContinue = await step.run("check-control-status", async () => {
      const current = await prisma.investigationRun.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (current?.status === "cancelled" || current?.status === "paused") {
        logger.info("Investigation stopped by user", { runId, status: current.status });
        return false;
      }
      return true;
    });

    if (!shouldContinue) return { ticketId, runId, status: "stopped" };

    // Step 2: Mark as awaiting human approval + create APPROVAL work item
    await step.run("set-awaiting-approval", async () => {
      const run = await prisma.investigationRun.update({
        where: { id: runId },
        data: {
          status: "awaiting_approval",
          approvalStatus: "pending",
        },
        include: { ticket: true },
      });
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "in_progress" },
      });

      // Create APPROVAL work item
      await createWorkItem({
        orgId: run.orgId,
        type: "APPROVAL",
        title: `Review investigation: ${run.ticket.title}`,
        summary: `Investigation complete for ticket "${run.ticket.title}". Draft response ready for review.`,
        requiredAction: "Review and approve/reject the drafted response",
        investigationRunId: runId,
        ticketId,
        actorType: "system",
        priorityContext: {
          severity: run.ticket.severity === "critical" ? "critical" : run.ticket.severity === "high" ? "high" : "medium",
        },
      });
    });

    // Step 3: Wait up to 72h for a human approval decision
    const approvalEvent = await step.waitForEvent("wait-for-approval", {
      event: "investigation/approval.submitted",
      match: "data.runId",
      timeout: "72h",
    });

    // Step 4: Process the approval (or handle timeout)
    await step.run("execute-approved-actions", async () => {
      if (!approvalEvent) {
        // Timeout — auto-complete without approval
        await prisma.investigationRun.update({
          where: { id: runId },
          data: {
            status: "complete",
            completedAt: new Date(),
            approvalStatus: "timeout",
          },
        });
        logger.info("Investigation auto-completed after approval timeout", { runId });
        return;
      }

      const { action, editedReply, note, actorId, originalDraft } = approvalEvent.data as {
        action: string;
        editedReply?: string;
        note?: string;
        actorId: string;
        originalDraft: string;
      };

      // Write audit trail
      await prisma.approvalAudit.create({
        data: {
          investigationRunId: runId,
          action,
          actorId,
          originalDraft: originalDraft || "",
          finalDraft: editedReply || originalDraft || null,
          note: note || null,
        },
      });

      // Update run with approval outcome
      await prisma.investigationRun.update({
        where: { id: runId },
        data: {
          status: "complete",
          completedAt: new Date(),
          approvalStatus: action,
          approvedAt: new Date(),
          approvedBy: actorId,
          editedReply: action === "approved" ? (editedReply || null) : null,
          reviewerNote: note || null,
        },
      });

      // Phase 5: Post Slack notification on approval
      const run = await prisma.investigationRun.findUnique({
        where: { id: runId },
        include: { ticket: true },
      });

      if (run) {
        const slack = getSlackAdapter();
        await slack.postApprovalSummary(runId, action, run.ticket.title);
      }

      // Complete the APPROVAL work item
      const approvalWorkItem = await prisma.workItem.findFirst({
        where: { investigationRunId: runId, type: "APPROVAL", status: { notIn: ["COMPLETED", "CANCELLED"] } },
      });
      if (approvalWorkItem) {
        await completeWorkItem(approvalWorkItem.id, actorId, `${action}: ${note || "no note"}`);
      }

      logger.info("Investigation approval processed", { runId, action, actorId });
    });

    return { ticketId, runId, status: "complete" };
  }
);

// Phase 6: Cluster tickets into incidents when a ticket is created
export const clusterTicketsFunction = inngest.createFunction(
  {
    id: "cluster-tickets",
    name: "Cluster Related Tickets into Incidents",
    retries: 1,
    timeouts: { finish: "5m" },
  },
  { event: "ticket/created" },
  async ({ step }) => {
    const clusters = await step.run("find-clusters", async () => {
      return suggestClusters();
    });

    logger.info("Ticket clustering complete", { clustersFound: clusters.length });

    // Auto-create incidents for clusters with 3+ tickets
    for (const cluster of clusters) {
      if (cluster.ticketIds.length < 3) continue;

      await step.run(`create-incident-${cluster.affectedProduct}`, async () => {
        const existing = await prisma.incident.findFirst({
          where: {
            affectedProduct: cluster.affectedProduct,
            affectedRegion: cluster.affectedRegion,
            status: { not: "resolved" },
          },
        });

        if (existing) {
          // Add new tickets to existing incident
          const existingTicketIds = (await prisma.incidentTicket.findMany({
            where: { incidentId: existing.id },
            select: { ticketId: true },
          })).map((it) => it.ticketId);

          const newTicketIds = cluster.ticketIds.filter((id) => !existingTicketIds.includes(id));
          if (newTicketIds.length > 0) {
            await prisma.incidentTicket.createMany({
              data: newTicketIds.map((ticketId) => ({ incidentId: existing.id, ticketId })),
              skipDuplicates: true,
            });
          }
        } else {
          const incident = await prisma.incident.create({
            data: {
              title: `${cluster.affectedProduct} issues in ${cluster.affectedRegion}`,
              severity: "P1",
              affectedProduct: cluster.affectedProduct,
              affectedRegion: cluster.affectedRegion,
              internalTimeline: JSON.parse(JSON.stringify([{
                timestamp: new Date().toISOString(),
                event: `Auto-detected: ${cluster.ticketIds.length} related tickets clustered`,
                author: "system",
              }])),
            },
          });

          await prisma.incidentTicket.createMany({
            data: cluster.ticketIds.map((ticketId) => ({ incidentId: incident.id, ticketId })),
            skipDuplicates: true,
          });

          // Create INCIDENT_UPDATE work item
          await createWorkItem({
            orgId: incident.orgId,
            type: "INCIDENT_UPDATE",
            title: `New incident: ${incident.title}`,
            summary: `Auto-detected: ${cluster.ticketIds.length} related tickets clustered into new incident.`,
            requiredAction: "Review incident, update status page, coordinate response",
            incidentId: incident.id,
            actorType: "system",
            priorityContext: { severity: "high", incidentSeverity: "P1" },
          });

          logger.info("Auto-created incident from cluster", {
            incidentId: incident.id,
            ticketCount: cluster.ticketIds.length,
          });
        }
      });
    }

    return { clustersFound: clusters.length };
  }
);

// Ticket Generation System: large batch generation via Inngest
export const batchGenerateTicketsFunction = inngest.createFunction(
  {
    id: "batch-generate-tickets",
    name: "Batch Generate Support Tickets",
    retries: 1,
    timeouts: { finish: "30m" },
  },
  { event: "generation/batch.requested" },
  async ({ event, step }) => {
    const { batchId, params } = event.data as { batchId: string; params: GenerationParams };

    // Step 1: Mark batch as running
    await step.run("mark-running", async () => {
      await prisma.generationBatch.update({
        where: { id: batchId },
        data: { status: "running" },
      });
    });

    // Step 2: Generate all drafts
    const drafts = await step.run("generate-drafts", async () => {
      return generateTicketBatch(params, batchId);
    });

    // Step 3: Find a customer to use — try org-scoped first, fall back to any
    const customerId = await step.run("resolve-customer", async () => {
      if (params.customerId) return params.customerId;
      const customer =
        (params.orgId
          ? await prisma.customer.findFirst({ where: { orgId: params.orgId }, orderBy: { createdAt: "asc" } })
          : null) ??
        (await prisma.customer.findFirst({ orderBy: { createdAt: "asc" } }));
      return customer?.id ?? null;
    });

    if (!customerId) {
      await prisma.generationBatch.update({
        where: { id: batchId },
        data: { status: "failed", errorMessage: "No customer found for org", completedAt: new Date() },
      });
      return { batchId, status: "failed" };
    }

    // Step 4: Create tickets in chunks of 10
    const CHUNK_SIZE = 10;
    let totalCreated = 0;

    for (let i = 0; i < drafts.length; i += CHUNK_SIZE) {
      const chunk = drafts.slice(i, i + CHUNK_SIZE);

      await step.run(`create-tickets-chunk-${i}`, async () => {
        for (const draft of chunk) {
          const ticket = await prisma.ticket.create({
            data: {
              title: draft.title,
              description: draft.description,
              severity: draft.severity,
              category: draft.category,
              product: draft.product,
              status: "open",
              customerId,
              orgId: params.orgId,
            },
          });

          await prisma.generatedTicketMeta.create({
            data: {
              ticketId: ticket.id,
              batchId,
              trueRootCause: draft.trueRootCause,
              trueCategory: draft.trueCategory,
              trueSeverity: draft.trueSeverity,
              affectedProduct: draft.affectedProduct,
              injectedFaults: JSON.parse(JSON.stringify(draft.injectedFaults)),
              scenario: draft.scenarioRole ? params.incidentScenario?.name ?? null : null,
              scenarioRole: draft.scenarioRole ?? null,
              difficulty: draft.difficulty,
            },
          });

          // Fire ticket/created for clustering
          await inngest.send({
            name: "ticket/created",
            data: { ticketId: ticket.id },
          });

          totalCreated++;
        }

        await prisma.generationBatch.update({
          where: { id: batchId },
          data: { totalCreated },
        });
      });
    }

    // Step 5: Finalize
    await step.run("finalize-batch", async () => {
      await prisma.generationBatch.update({
        where: { id: batchId },
        data: { status: "complete", completedAt: new Date(), totalCreated },
      });
    });

    return { batchId, totalCreated, status: "complete" };
  }
);

// ─── Mission Control: Work Signal Processing ───

export const processWorkSignalFunction = inngest.createFunction(
  {
    id: "process-work-signal",
    name: "Process Work Signal",
    retries: 2,
    timeouts: { finish: "2m" },
  },
  { event: "work-signal/received" },
  async ({ event, step }) => {
    const { signalId } = event.data as { signalId: string };

    // Step 1: Load signal
    const signal = await step.run("load-signal", async () => {
      const s = await prisma.workSignal.findUniqueOrThrow({ where: { id: signalId } });
      await prisma.workSignal.update({
        where: { id: signalId },
        data: { processingStatus: "processing" },
      });
      return s;
    });

    // Step 2: Extract action via AI
    const extraction = await step.run("extract-action", async () => {
      return extractAction({
        eventType: signal.eventType,
        payload: signal.payload,
        evidence: signal.evidence,
        sourceSystem: signal.sourceSystem,
      });
    });

    // Step 3: Reconcile signal to work item
    const workItemId = await step.run("reconcile-signal", async () => {
      return reconcileSignal(signalId, extraction, signal.orgId);
    });

    // Step 4: Recalculate priority if work item created
    if (workItemId) {
      await step.run("recalculate-priority", async () => {
        const item = await prisma.workItem.findUnique({
          where: { id: workItemId },
          include: { ticket: { include: { customer: true } } },
        });
        if (!item) return;

        const priority = calculatePriority({
          severity: item.ticket?.severity,
          customerTier: item.ticket?.customer?.plan,
        });

        await prisma.workItem.update({
          where: { id: workItemId },
          data: { priorityScore: priority.score, priorityBand: priority.band },
        });
      });
    }

    logger.info("Work signal processed", { signalId, workItemId });
    return { signalId, workItemId };
  }
);

export const recalculatePrioritiesFunction = inngest.createFunction(
  {
    id: "recalculate-priorities",
    name: "Batch Recalculate Work Item Priorities",
    retries: 1,
    timeouts: { finish: "5m" },
  },
  { event: "work-items/recalculate" },
  async ({ event, step }) => {
    const { orgId } = event.data as { orgId: string };

    await step.run("recalculate-all", async () => {
      const items = await prisma.workItem.findMany({
        where: {
          orgId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        include: { ticket: { include: { customer: true } }, incident: true },
      });

      for (const item of items) {
        const priority = calculatePriority({
          severity: item.ticket?.severity,
          customerTier: item.ticket?.customer?.plan,
          incidentSeverity: item.incident?.severity,
        });

        await prisma.workItem.update({
          where: { id: item.id },
          data: { priorityScore: priority.score, priorityBand: priority.band },
        });
      }

      logger.info("Batch priority recalculation complete", { orgId, count: items.length });
    });
  }
);

export const refreshAgentContextFunction = inngest.createFunction(
  {
    id: "refresh-agent-context",
    name: "Refresh Agent Work Context",
    retries: 1,
    timeouts: { finish: "1m" },
  },
  { event: "work-context/refresh.requested" },
  async ({ event, step }) => {
    const { agentId, orgId } = event.data as { agentId: string; orgId: string };

    await step.run("refresh-context", async () => {
      await refreshWorkContext(agentId, orgId);
    });

    logger.info("Agent context refreshed", { agentId, orgId });
  }
);

export const activateScheduledFollowupsFunction = inngest.createFunction(
  {
    id: "activate-scheduled-followups",
    name: "Activate Snoozed Work Items",
    retries: 1,
    timeouts: { finish: "2m" },
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const activated = await step.run("activate-snoozed", async () => {
      const snoozed = await prisma.workItem.findMany({
        where: {
          status: "SNOOZED",
          snoozedUntil: { lte: new Date() },
        },
      });

      let count = 0;
      for (const item of snoozed) {
        try {
          await resumeWorkItem(item.id);
          count++;
        } catch (e) {
          logger.warn("Failed to resume snoozed item", { id: item.id, error: (e as Error).message });
        }
      }
      return count;
    });

    logger.info("Snoozed items activated", { count: activated });
    return { activated };
  }
);

export const generateShiftBriefingFunction = inngest.createFunction(
  {
    id: "generate-shift-briefing",
    name: "Generate Shift Briefing",
    retries: 1,
    timeouts: { finish: "2m" },
  },
  { event: "shift-briefing/generate.requested" },
  async ({ event, step }) => {
    const { agentId, orgId } = event.data as { agentId: string; orgId: string };

    await step.run("generate-briefing", async () => {
      await generateBriefing(agentId, orgId);
    });

    logger.info("Shift briefing generated", { agentId, orgId });
  }
);

export const detectStaleResponsibilitiesFunction = inngest.createFunction(
  {
    id: "detect-stale-responsibilities",
    name: "Detect Stale Work Items",
    retries: 1,
    timeouts: { finish: "2m" },
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const flagged = await step.run("detect-stale", async () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

      // Find IN_PROGRESS items with no events in last 4 hours
      const staleItems = await prisma.workItem.findMany({
        where: {
          status: "IN_PROGRESS",
          updatedAt: { lte: fourHoursAgo },
        },
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      const trueStale = staleItems.filter((item) => {
        const lastEvent = item.events[0];
        return !lastEvent || lastEvent.createdAt < fourHoursAgo;
      });

      for (const item of trueStale) {
        // Bump priority slightly
        const newScore = Math.min(item.priorityScore + 5, 100);
        await prisma.workItem.update({
          where: { id: item.id },
          data: { priorityScore: newScore },
        });

        await prisma.workItemEvent.create({
          data: {
            workItemId: item.id,
            eventType: "reprioritized",
            actorType: "system",
            note: "Auto-bumped: no activity for 4+ hours",
            previousValue: JSON.parse(JSON.stringify({ priorityScore: item.priorityScore })),
            newValue: JSON.parse(JSON.stringify({ priorityScore: newScore })),
          },
        });
      }

      return trueStale.length;
    });

    logger.info("Stale responsibility detection complete", { flagged });
    return { flagged };
  }
);

// ─── Devin AI: Poll Task Session ───

export const pollDevinTaskFunction = inngest.createFunction(
  {
    id: "poll-devin-task",
    name: "Poll Devin Task Session",
    retries: 2,
    timeouts: { finish: "3h" },
  },
  { event: "devin/task.created" },
  async ({ event, step }) => {
    const { devinTaskId } = event.data as { devinTaskId: string };

    // Step 1: Create Devin session
    const sessionId = await step.run("create-session", async () => {
      const task = await prisma.devinTask.findUniqueOrThrow({ where: { id: devinTaskId } });
      const adapter = getDevinAdapter();

      await prisma.devinTask.update({
        where: { id: devinTaskId },
        data: { status: "creating" },
      });

      const promptData = task.promptSnapshot as { prompt?: string };
      const prompt = promptData.prompt ?? JSON.stringify(task.promptSnapshot);

      const result = await adapter.createSession({ prompt });

      await prisma.devinTask.update({
        where: { id: devinTaskId },
        data: {
          devinSessionId: result.session_id,
          sessionUrl: result.url,
          status: "working",
          startedAt: new Date(),
        },
      });

      // Transition WorkItem to IN_PROGRESS
      if (task.workItemId) {
        try {
          await transitionWorkItem(task.workItemId, "IN_PROGRESS", undefined, "ai", "Devin session started");
        } catch { /* may already be in progress */ }
      }

      return result.session_id;
    });

    // Step 2: Poll loop — 2m intervals, max 90 polls (~3h)
    const MAX_POLLS = 90;

    for (let i = 0; i < MAX_POLLS; i++) {
      await step.sleep(`poll-wait-${i}`, "2m");

      const pollResult = await step.run(`poll-${i}`, async () => {
        const task = await prisma.devinTask.findUniqueOrThrow({ where: { id: devinTaskId } });
        if (task.status === "cancelled") return { done: true, status: "cancelled" };

        const adapter = getDevinAdapter();
        const session = await adapter.getSession(sessionId);
        const internalStatus = mapDevinStatusToInternal(session.status_enum, session);
        const terminal = ["finished", "failed", "expired"].includes(internalStatus);

        const statusChanged = internalStatus !== task.status;
        await prisma.devinTask.update({
          where: { id: devinTaskId },
          data: {
            status: internalStatus,
            pullRequestUrl: session.pull_request?.url ?? task.pullRequestUrl,
            structuredResult: session.structured_output
              ? JSON.parse(JSON.stringify(session.structured_output))
              : task.structuredResult,
            pollCount: { increment: 1 },
            lastPolledAt: new Date(),
            ...(terminal ? { completedAt: new Date() } : {}),
          },
        });

        if (statusChanged && task.workItemId) {
          await prisma.workItemEvent.create({
            data: {
              workItemId: task.workItemId,
              eventType: "devin_status_changed",
              actorType: "ai",
              newValue: JSON.parse(JSON.stringify({
                devinStatus: internalStatus,
                devinSessionStatus: session.status_enum,
              })),
            },
          });
        }

        return { done: terminal, status: internalStatus };
      });

      if (pollResult.done) break;
    }

    // Step 3: Parse final result
    await step.run("finalize", async () => {
      const task = await prisma.devinTask.findUniqueOrThrow({ where: { id: devinTaskId } });
      if (task.status === "cancelled") return;

      const adapter = getDevinAdapter();
      const session = await adapter.getSession(task.devinSessionId!);
      const parsed = parseDevinResult(session, task.mode as "reproduce" | "fix");

      await prisma.devinTask.update({
        where: { id: devinTaskId },
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
            `Devin ${task.mode}: ${parsed.verdict}`
          );
        } catch { /* may already be completed/cancelled */ }
      }
    });

    return { devinTaskId };
  }
);
