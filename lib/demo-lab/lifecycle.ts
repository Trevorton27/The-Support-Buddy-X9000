/**
 * Demo Lab Lifecycle — state machine for scenario transitions with verification gates.
 */

import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const logger = createLogger("demo-lab-lifecycle");

// Valid status transitions
const TRANSITIONS: Record<string, string[]> = {
  pending: ["activating", "broken", "failed", "completed"],
  available: ["activating"],
  activating: ["broken", "failed"],
  broken: ["ticket_open", "resetting", "failed"],
  ticket_open: ["investigating", "resetting", "failed"],
  investigating: ["awaiting_approval", "failed", "resetting"],
  awaiting_approval: ["devin_reproducing", "resetting", "failed"],
  devin_reproducing: ["devin_fixing", "resetting", "failed"],
  devin_fixing: ["pr_ready", "resetting", "failed"],
  pr_ready: ["fixed", "resetting", "failed"],
  fixed: ["resetting", "completed"],
  resetting: ["available", "failed"],
  failed: ["resetting", "available"],
  completed: ["available"],
};

export type ScenarioStatus = keyof typeof TRANSITIONS;
export type DemoRunStatus =
  | "pending"
  | "activating"
  | "broken"
  | "ticket_open"
  | "investigating"
  | "awaiting_approval"
  | "devin_reproducing"
  | "devin_fixing"
  | "pr_ready"
  | "fixed"
  | "resetting"
  | "failed"
  | "completed";

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TimelineEntry {
  timestamp: string;
  event: string;
  detail?: string;
}

function addTimelineEntry(
  existing: TimelineEntry[] | null,
  event: string,
  detail?: string
): TimelineEntry[] {
  const entries = existing ?? [];
  return [
    ...entries,
    { timestamp: new Date().toISOString(), event, detail },
  ];
}

/**
 * Create a new DemoRun for a scenario.
 */
export async function createDemoRun(
  scenarioId: string,
  userId: string,
  orgId: string
) {
  const scenario = await prisma.demoIssueScenario.findUnique({
    where: { id: scenarioId },
  });
  if (!scenario) throw new Error("Scenario not found");
  if (scenario.status !== "available" && scenario.status !== "failed" && scenario.status !== "completed") {
    throw new Error(`Scenario is currently ${scenario.status}, cannot start a new run`);
  }

  const generation = scenario.generation + 1;
  const branch = `demo/${scenario.key}/${generation}`;

  const run = await prisma.demoRun.create({
    data: {
      scenarioId,
      generation,
      status: "pending",
      branch,
      createdBy: userId,
      orgId,
      timeline: JSON.parse(JSON.stringify([
        { timestamp: new Date().toISOString(), event: "run_created", detail: `Generation ${generation}` },
      ])),
    },
  });

  await prisma.demoIssueScenario.update({
    where: { id: scenarioId },
    data: {
      status: "activating",
      generation,
      activeBranch: branch,
    },
  });

  logger.info("Demo run created", { runId: run.id, scenarioKey: scenario.key, generation });
  return run;
}

/**
 * Transition a DemoRun to a new status with timeline entry.
 */
export async function transitionRun(
  runId: string,
  newStatus: DemoRunStatus,
  detail?: string,
  updates?: Record<string, unknown>
) {
  const run = await prisma.demoRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error("Run not found");

  if (!canTransition(run.status, newStatus)) {
    throw new Error(`Cannot transition from ${run.status} to ${newStatus}`);
  }

  const timeline = addTimelineEntry(
    run.timeline as TimelineEntry[] | null,
    `status_${newStatus}`,
    detail
  );

  const data: Record<string, unknown> = {
    status: newStatus,
    timeline: JSON.parse(JSON.stringify(timeline)),
    ...updates,
  };

  if (newStatus === "completed" || newStatus === "fixed") {
    data.completedAt = new Date();
  }
  if (newStatus === "failed" && detail) {
    data.errorMessage = detail;
  }

  const updated = await prisma.demoRun.update({
    where: { id: runId },
    data,
  });

  // Sync scenario status
  await prisma.demoIssueScenario.update({
    where: { id: run.scenarioId },
    data: {
      status: newStatus === "completed" ? "available" : newStatus,
      ...(updates?.ticketId ? { activeTicketId: updates.ticketId as string } : {}),
      ...(updates?.devinReproduceId || updates?.devinFixId
        ? { activeDevinTaskId: (updates.devinFixId ?? updates.devinReproduceId) as string }
        : {}),
    },
  });

  logger.info("Demo run transitioned", { runId, from: run.status, to: newStatus });
  return updated;
}

/**
 * Reset a scenario back to available.
 */
export async function resetScenario(scenarioId: string) {
  await prisma.demoIssueScenario.update({
    where: { id: scenarioId },
    data: {
      status: "available",
      activeTicketId: null,
      activeDevinTaskId: null,
      activeBranch: null,
    },
  });

  logger.info("Scenario reset", { scenarioId });
}

/**
 * Get full scenario with latest run.
 */
export async function getScenarioWithLatestRun(scenarioId: string) {
  const scenario = await prisma.demoIssueScenario.findUnique({
    where: { id: scenarioId },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  return scenario;
}

/**
 * Get all scenarios with their latest run.
 */
export async function listScenariosWithRuns(orgId: string) {
  const scenarios = await prisma.demoIssueScenario.findMany({
    where: { orgId: { in: [orgId, ""] } },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { key: "asc" },
  });
  return scenarios;
}
