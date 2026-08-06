import { inngest } from "./client";
import { prisma } from "@/lib/db";
import { runInvestigation } from "@/agents/graph";
import { suggestClusters } from "@/lib/incident-clustering";
import { getSlackAdapter } from "@/lib/integrations/slack";
import { createLogger } from "@/lib/logger";
import { generateTicketBatch } from "@/lib/generation/ticket-generator";
import type { GenerationParams } from "@/lib/generation/types";

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

    // Step 2: Mark as awaiting human approval
    await step.run("set-awaiting-approval", async () => {
      await prisma.investigationRun.update({
        where: { id: runId },
        data: {
          status: "awaiting_approval",
          approvalStatus: "pending",
        },
      });
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "in_progress" },
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
