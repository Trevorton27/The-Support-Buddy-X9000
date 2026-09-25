import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDemoRun, transitionRun, resetScenario, getScenarioWithLatestRun } from "@/lib/demo-lab/lifecycle";
import { injectBug, fixBug, getDemoRepoPath, getTemplate } from "@/lib/bug-generator/generator";
import { injectDefectOnBranch, deleteBranch } from "@/lib/demo-lab/git-ops";
import { inngest } from "@/inngest/client";
import { createLogger } from "@/lib/logger";

const DEMO_REPO = process.env.DEMO_PRODUCT_REPO ?? "Trevorton27/support-buddy-demo-product";

const logger = createLogger("demo-lab-api");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  const { response } = await requireOrgAuth();
  if (response) return response;

  const { scenarioId } = await params;
  const scenario = await getScenarioWithLatestRun(scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  // Include run history
  const runs = await prisma.demoRun.findMany({
    where: { scenarioId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ scenario, runs });
}

const actionSchema = z.object({
  action: z.enum(["activate", "create_ticket", "investigate", "reset", "run_full"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { scenarioId } = await params;
  const body = await request.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const scenario = await prisma.demoIssueScenario.findUnique({
    where: { id: scenarioId },
  });
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const { action } = parsed.data;

  try {
    switch (action) {
      case "activate": {
        // Create run, inject defect
        const run = await createDemoRun(scenarioId, userId!, orgId ?? "");
        const template = getTemplate(scenario.key);
        const defect = scenario.defectPatch as { buggyCode: string; fixedCode: string; filePath: string; testFilePath: string; testCode: string } | null;

        // Try local filesystem first, fall back to GitHub API
        const localRepo = getDemoRepoPath();
        if (localRepo) {
          const result = injectBug(scenario.key);
          if (!result.success) {
            await transitionRun(run.id, "failed", result.error);
            return NextResponse.json({ error: result.error }, { status: 500 });
          }
          await transitionRun(run.id, "broken", "Defect injected locally");
        } else if (template && defect) {
          try {
            await injectDefectOnBranch(DEMO_REPO, "main", run.branch!, {
              filePath: template.filePath,
              fixedCode: template.fixedCode,
              buggyCode: template.buggyCode,
              testFilePath: template.testFilePath,
              testCode: template.testCode,
            });
            await transitionRun(run.id, "broken", `Defect injected on branch ${run.branch}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "GitHub API defect injection failed";
            await transitionRun(run.id, "failed", msg);
            return NextResponse.json({ error: msg }, { status: 500 });
          }
        } else {
          await transitionRun(run.id, "failed", "No defect patch or template found for this scenario");
          return NextResponse.json({ error: "No defect patch or template found" }, { status: 500 });
        }

        return NextResponse.json({ runId: run.id, status: "broken" });
      }

      case "create_ticket": {
        // Find active run
        const activeRun = await prisma.demoRun.findFirst({
          where: { scenarioId, status: "broken" },
          orderBy: { createdAt: "desc" },
        });
        if (!activeRun) {
          return NextResponse.json({ error: "No active broken run. Activate the scenario first." }, { status: 400 });
        }

        const ticketTemplate = scenario.ticketTemplate as {
          title: string;
          description: string;
          severity: string;
          category: string;
          product: string;
        };

        // Find or create a customer for the ticket
        const customer = await prisma.customer.findFirst({
          where: { orgId: { in: [orgId ?? "", ""] } },
        });
        if (!customer) {
          return NextResponse.json({ error: "No customer found. Run npm run seed first." }, { status: 400 });
        }

        const ticket = await prisma.ticket.create({
          data: {
            title: ticketTemplate.title,
            description: ticketTemplate.description,
            severity: ticketTemplate.severity,
            category: ticketTemplate.category,
            product: ticketTemplate.product,
            customerId: customer.id,
            orgId: orgId ?? "",
          },
        });

        // Fire ticket/created for clustering + GitHub sync
        await inngest.send({
          name: "ticket/created",
          data: { ticketId: ticket.id },
        });

        await transitionRun(activeRun.id, "ticket_open", `Ticket ${ticket.id} created`, { ticketId: ticket.id });
        return NextResponse.json({ runId: activeRun.id, ticketId: ticket.id, status: "ticket_open" });
      }

      case "investigate": {
        const activeRun = await prisma.demoRun.findFirst({
          where: { scenarioId, status: "ticket_open" },
          orderBy: { createdAt: "desc" },
        });
        if (!activeRun || !activeRun.ticketId) {
          return NextResponse.json({ error: "No ticket to investigate. Create a ticket first." }, { status: 400 });
        }

        // Create investigation run
        const investigation = await prisma.investigationRun.create({
          data: {
            ticketId: activeRun.ticketId,
            status: "pending",
            orgId: orgId ?? "",
          },
        });

        // Fire Inngest event
        await inngest.send({
          name: "investigation/run.requested",
          data: { runId: investigation.id, ticketId: activeRun.ticketId },
        });

        await transitionRun(activeRun.id, "investigating", `Investigation ${investigation.id} started`, {
          investigationId: investigation.id,
        });

        return NextResponse.json({ runId: activeRun.id, investigationId: investigation.id, status: "investigating" });
      }

      case "reset": {
        // Revert the bug: local filesystem or GitHub branch cleanup
        const localRepoPath = getDemoRepoPath();
        if (localRepoPath) {
          fixBug(scenario.key);
        } else if (scenario.activeBranch) {
          try {
            await deleteBranch(DEMO_REPO, scenario.activeBranch);
          } catch (err) {
            logger.warn("Failed to delete branch during reset", { branch: scenario.activeBranch, error: String(err) });
          }
        }

        await resetScenario(scenarioId);

        // Mark any active runs as completed
        const activeRuns = await prisma.demoRun.findMany({
          where: {
            scenarioId,
            status: { notIn: ["completed", "failed"] },
          },
        });
        for (const runToReset of activeRuns) {
          await transitionRun(runToReset.id, "completed", "Reset by user");
        }

        return NextResponse.json({ status: "available" });
      }

      case "run_full": {
        // Start the full orchestrated demo via Inngest
        const run = await createDemoRun(scenarioId, userId!, orgId ?? "");

        await inngest.send({
          name: "demo-lab/run.requested",
          data: {
            demoRunId: run.id,
            scenarioId,
            orgId: orgId ?? "",
            userId: userId!,
          },
        });

        return NextResponse.json({ runId: run.id, status: "pending" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    logger.error("Demo lab action failed", { action, scenarioId, error: String(err) });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
