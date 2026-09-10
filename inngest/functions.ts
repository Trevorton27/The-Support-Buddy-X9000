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
import { transitionRun } from "@/lib/demo-lab/lifecycle";
import { injectBug, fixBug } from "@/lib/bug-generator/generator";
import { processDefectManifest } from "@/lib/demo-lab/defect-author";
import { syncTicketToGitHub } from "@/lib/github-sync";

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

// GitHub Issue Sync — create corresponding issue on demo product repo
export const syncTicketToGitHubFunction = inngest.createFunction(
  {
    id: "sync-ticket-to-github",
    name: "Sync Ticket to GitHub Issue",
    retries: 2,
    timeouts: { finish: "2m" },
  },
  { event: "ticket/created" },
  async ({ event, step }) => {
    const { ticketId } = event.data as { ticketId: string };

    const result = await step.run("create-github-issue", async () => {
      return syncTicketToGitHub(ticketId);
    });

    if (result) {
      logger.info("Ticket synced to GitHub", { ticketId, issueUrl: result.issueUrl });
    }

    return { ticketId, synced: !!result, issueUrl: result?.issueUrl ?? null };
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

      if (task.mode === "defect_author") {
        // For defect_author, store the full structured output without parsing as reproduce/fix
        await prisma.devinTask.update({
          where: { id: devinTaskId },
          data: {
            verdict: session.structured_output?.verdict as string ?? (session.status_enum === "finished" ? "DEFECT_CREATED" : "DEFECT_FAILED"),
            verdictReason: session.structured_output?.verdictReason as string ?? "",
            pullRequestUrl: session.pull_request?.url ?? task.pullRequestUrl,
            structuredResult: session.structured_output
              ? JSON.parse(JSON.stringify(session.structured_output))
              : task.structuredResult,
            status: task.status === "working" ? "finished" : task.status,
          },
        });
      } else {
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
      }

      // Complete WorkItem
      if (task.workItemId) {
        try {
          await transitionWorkItem(
            task.workItemId, "COMPLETED", undefined, "ai",
            `Devin ${task.mode}: ${task.verdict ?? "completed"}`
          );
        } catch { /* may already be completed/cancelled */ }
      }
    });

    // Step 4: For defect_author tasks, create scenario from manifest
    await step.run("process-defect-manifest", async () => {
      const task = await prisma.devinTask.findUniqueOrThrow({ where: { id: devinTaskId } });
      if (task.mode !== "defect_author" || task.status !== "finished") return;

      const result = await processDefectManifest(devinTaskId);
      if (result.scenarioId) {
        logger.info("Defect manifest processed into scenario", {
          taskId: devinTaskId,
          scenarioId: result.scenarioId,
        });
      } else {
        logger.warn("Failed to process defect manifest", {
          taskId: devinTaskId,
          error: result.error,
        });
      }
    });

    return { devinTaskId };
  }
);

// ─── Demo Lab: Full Scenario Orchestration ───

export const runDemoScenarioFunction = inngest.createFunction(
  {
    id: "run-demo-scenario",
    name: "Run Demo Lab Scenario (Full Lifecycle)",
    retries: 1,
    timeouts: { finish: "74h" }, // 72h HITL wait + buffer
  },
  { event: "demo-lab/run.requested" },
  async ({ event, step }) => {
    const { demoRunId, scenarioId, orgId, userId } = event.data as {
      demoRunId: string;
      scenarioId: string;
      orgId: string;
      userId: string;
    };

    logger.info("Demo scenario run started", { demoRunId, scenarioId });

    // Step 1: Load scenario and inject defect
    const scenarioData = await step.run("inject-defect", async () => {
      const scenario = await prisma.demoIssueScenario.findUniqueOrThrow({
        where: { id: scenarioId },
      });

      const ticketTemplate = scenario.ticketTemplate as {
        title: string;
        description: string;
        severity: string;
        category: string;
        product: string;
      };

      const result = injectBug(scenario.key);
      if (!result.success) {
        await transitionRun(demoRunId, "failed", result.error ?? "Bug injection failed");
        return { failed: true as const, scenario, ticketTemplate };
      }

      await transitionRun(demoRunId, "broken", "Defect injected locally");
      return { failed: false as const, scenario, ticketTemplate };
    });

    if (scenarioData.failed) return { demoRunId, status: "failed" };

    // Step 2: Create support ticket
    const ticketId = await step.run("create-ticket", async () => {
      const customer = await prisma.customer.findFirst({
        where: { orgId: { in: [orgId, ""] } },
      });
      if (!customer) throw new Error("No customer found. Run npm run seed first.");

      const tmpl = scenarioData.ticketTemplate!;
      const ticket = await prisma.ticket.create({
        data: {
          title: tmpl.title,
          description: tmpl.description,
          severity: tmpl.severity,
          category: tmpl.category,
          product: tmpl.product,
          customerId: customer.id,
          orgId,
        },
      });

      await transitionRun(demoRunId, "ticket_open", `Ticket ${ticket.id} created`, {
        ticketId: ticket.id,
      });

      return ticket.id;
    });

    // Step 3: Create and run investigation
    const investigationId = await step.run("start-investigation", async () => {
      const investigation = await prisma.investigationRun.create({
        data: {
          ticketId,
          status: "pending",
          orgId,
        },
      });

      await inngest.send({
        name: "investigation/run.requested",
        data: { runId: investigation.id, ticketId },
      });

      await transitionRun(demoRunId, "investigating", `Investigation ${investigation.id} started`, {
        investigationId: investigation.id,
      });

      return investigation.id;
    });

    // Step 4: Wait for investigation to reach awaiting_approval
    // The investigation function sets status to awaiting_approval when done.
    // Poll until status changes (max ~10 min for graph execution).
    const MAX_INVESTIGATION_POLLS = 30;
    for (let i = 0; i < MAX_INVESTIGATION_POLLS; i++) {
      await step.sleep(`investigation-poll-wait-${i}`, "20s");

      const investigationDone = await step.run(`investigation-poll-${i}`, async () => {
        const run = await prisma.investigationRun.findUnique({
          where: { id: investigationId },
          select: { status: true },
        });
        return run?.status === "awaiting_approval" || run?.status === "complete";
      });

      if (investigationDone) break;
    }

    // Sync demo run status to awaiting_approval
    await step.run("mark-awaiting-approval", async () => {
      const run = await prisma.investigationRun.findUnique({
        where: { id: investigationId },
        select: { status: true },
      });

      if (run?.status === "awaiting_approval") {
        await transitionRun(demoRunId, "awaiting_approval", "Investigation complete, awaiting human approval");
      } else if (run?.status === "complete") {
        // Already approved (fast path or auto-approved)
        await transitionRun(demoRunId, "awaiting_approval", "Investigation complete");
      } else {
        await transitionRun(demoRunId, "failed", "Investigation did not complete in time");
      }
    });

    // Check if we failed
    const currentStatus = await step.run("check-status-after-investigation", async () => {
      const run = await prisma.demoRun.findUnique({ where: { id: demoRunId }, select: { status: true } });
      return run?.status;
    });
    if (currentStatus === "failed") return { demoRunId, status: "failed" };

    // Step 5: Wait for HITL approval (the investigation function handles this via its own waitForEvent)
    // We wait for the investigation to be fully complete (approved/rejected)
    const MAX_APPROVAL_POLLS = 720; // ~72h at 6min intervals
    for (let i = 0; i < MAX_APPROVAL_POLLS; i++) {
      await step.sleep(`approval-poll-wait-${i}`, "6m");

      const approvalDone = await step.run(`approval-poll-${i}`, async () => {
        const run = await prisma.investigationRun.findUnique({
          where: { id: investigationId },
          select: { approvalStatus: true, status: true },
        });
        return run?.approvalStatus === "approved" || run?.approvalStatus === "rejected" || run?.approvalStatus === "timeout" || run?.status === "complete";
      });

      if (approvalDone) break;
    }

    // Step 6: Dispatch Devin reproduce
    const reproduceTaskId = await step.run("dispatch-devin-reproduce", async () => {
      const investigation = await prisma.investigationRun.findUnique({
        where: { id: investigationId },
        select: { approvalStatus: true },
      });

      if (investigation?.approvalStatus !== "approved") {
        logger.info("Investigation not approved, skipping Devin", {
          demoRunId,
          approvalStatus: investigation?.approvalStatus,
        });
        return null;
      }

      const adapter = getDevinAdapter();
      const scenario = await prisma.demoIssueScenario.findUniqueOrThrow({ where: { id: scenarioId } });

      const reproSteps = scenario.reproductionSteps as string[] | null;
      const prompt = [
        `Reproduce the following bug in the support-buddy-demo-product repository.`,
        `Bug: ${scenario.title}`,
        `Description: ${scenario.description}`,
        ...(reproSteps ? [`Steps to reproduce:\n${reproSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`] : []),
      ].join("\n\n");

      // Find repository
      const service = await prisma.productService.findUnique({ where: { name: scenario.service } });
      let repoSlug = `Trevorton27/support-buddy-demo-product`;
      if (service?.repositoryId) {
        const repo = await prisma.codeRepository.findUnique({ where: { id: service.repositoryId } });
        if (repo) repoSlug = `${repo.owner}/${repo.repository}`;
      }

      const task = await prisma.devinTask.create({
        data: {
          investigationRunId: investigationId,
          mode: "reproduce",
          status: "pending",
          repository: repoSlug,
          promptSnapshot: JSON.parse(JSON.stringify({ prompt })),
          orgId,
          createdBy: userId,
        },
      });

      await inngest.send({
        name: "devin/task.created",
        data: { devinTaskId: task.id },
      });

      await transitionRun(demoRunId, "devin_reproducing", `Devin reproduce task ${task.id} started`, {
        devinReproduceId: task.id,
      });

      return task.id;
    });

    if (!reproduceTaskId) {
      // Not approved — skip Devin, mark as completed
      await step.run("complete-without-devin", async () => {
        fixBug(scenarioData.scenario.key);
        await transitionRun(demoRunId, "completed", "Demo completed without Devin (not approved)");
      });
      return { demoRunId, status: "completed" };
    }

    // Step 7: Wait for Devin reproduce to finish
    const MAX_DEVIN_POLLS = 90; // ~3h at 2min intervals
    for (let i = 0; i < MAX_DEVIN_POLLS; i++) {
      await step.sleep(`reproduce-poll-wait-${i}`, "2m");

      const reproduceDone = await step.run(`reproduce-poll-${i}`, async () => {
        const task = await prisma.devinTask.findUnique({
          where: { id: reproduceTaskId },
          select: { status: true },
        });
        return ["finished", "failed", "expired", "cancelled"].includes(task?.status ?? "");
      });

      if (reproduceDone) break;
    }

    // Step 8: Dispatch Devin fix
    const fixTaskId = await step.run("dispatch-devin-fix", async () => {
      const reproduceTask = await prisma.devinTask.findUnique({ where: { id: reproduceTaskId } });
      if (reproduceTask?.status !== "finished") {
        logger.info("Devin reproduce did not succeed, skipping fix", { demoRunId, status: reproduceTask?.status });
        return null;
      }

      const scenario = await prisma.demoIssueScenario.findUniqueOrThrow({ where: { id: scenarioId } });
      const acceptance = scenario.acceptanceCriteria as string[] | null;

      const prompt = [
        `Fix the following bug in the support-buddy-demo-product repository.`,
        `Bug: ${scenario.title}`,
        `Description: ${scenario.description}`,
        ...(acceptance ? [`Acceptance criteria:\n${acceptance.map((a, i) => `${i + 1}. ${a}`).join("\n")}`] : []),
      ].join("\n\n");

      const task = await prisma.devinTask.create({
        data: {
          investigationRunId: investigationId,
          mode: "fix",
          status: "pending",
          repository: reproduceTask.repository,
          promptSnapshot: JSON.parse(JSON.stringify({ prompt })),
          orgId,
          createdBy: userId,
        },
      });

      await inngest.send({
        name: "devin/task.created",
        data: { devinTaskId: task.id },
      });

      await transitionRun(demoRunId, "devin_fixing", `Devin fix task ${task.id} started`, {
        devinFixId: task.id,
      });

      return task.id;
    });

    if (!fixTaskId) {
      await step.run("complete-after-failed-reproduce", async () => {
        fixBug(scenarioData.scenario.key);
        await transitionRun(demoRunId, "failed", "Devin reproduce did not succeed");
      });
      return { demoRunId, status: "failed" };
    }

    // Step 9: Wait for Devin fix to finish
    for (let i = 0; i < MAX_DEVIN_POLLS; i++) {
      await step.sleep(`fix-poll-wait-${i}`, "2m");

      const fixDone = await step.run(`fix-poll-${i}`, async () => {
        const task = await prisma.devinTask.findUnique({
          where: { id: fixTaskId },
          select: { status: true },
        });
        return ["finished", "failed", "expired", "cancelled"].includes(task?.status ?? "");
      });

      if (fixDone) break;
    }

    // Step 10: Finalize
    await step.run("finalize-demo", async () => {
      const fixTask = await prisma.devinTask.findUnique({ where: { id: fixTaskId } });

      if (fixTask?.status === "finished") {
        if (fixTask.pullRequestUrl) {
          await transitionRun(demoRunId, "pr_ready", `PR ready: ${fixTask.pullRequestUrl}`, {
            pullRequestUrl: fixTask.pullRequestUrl,
          });
        }
        // Revert local bug since Devin's fix is on a PR branch
        fixBug(scenarioData.scenario.key);
        await transitionRun(demoRunId, "fixed", "Devin fix completed");
        await transitionRun(demoRunId, "completed", "Full demo cycle complete");
      } else {
        fixBug(scenarioData.scenario.key);
        await transitionRun(demoRunId, "failed", `Devin fix ended with status: ${fixTask?.status}`);
      }
    });

    logger.info("Demo scenario run complete", { demoRunId });
    return { demoRunId, status: "completed" };
  }
);
