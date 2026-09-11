import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { createWorkItem } from "@/lib/work-items";
import { buildReproductionPrompt, buildFixPrompt } from "@/lib/integrations/devin/prompt-builder";
import type { DevinTaskContext } from "@/lib/integrations/devin/prompt-builder";
import type { Hypothesis, LogEntry, KnowledgeChunk, CorrelatedIncident, Deployment } from "@/agents/state";
import { TERMINAL_STATUSES } from "@/lib/integrations/devin/types";

const createTaskSchema = z.object({
  mode: z.enum(["reproduce", "fix"]),
  ticketId: z.string().optional(),
  investigationRunId: z.string().optional(),
  repositoryId: z.string().optional(),
});

export async function POST(request: Request) {
  const { userId, orgId, orgRole, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { mode, ticketId, investigationRunId, repositoryId } = parsed.data;

  try {
  if (!ticketId && !investigationRunId) {
    return NextResponse.json({ error: "At least one of ticketId or investigationRunId is required" }, { status: 400 });
  }

  // Fix mode requires approved investigation and admin role
  if (mode === "fix") {
    if (!investigationRunId) {
      return NextResponse.json({ error: "investigationRunId is required for fix mode" }, { status: 400 });
    }
    if (orgRole !== "org:admin") {
      return NextResponse.json({ error: "Fix mode requires admin role" }, { status: 403 });
    }
  }

  // Load investigation with steps if provided
  let investigation = null;
  if (investigationRunId) {
    investigation = await prisma.investigationRun.findUnique({
      where: { id: investigationRunId },
      include: {
        ticket: { include: { customer: true } },
        steps: { orderBy: { startedAt: "asc" } },
      },
    });
    if (!investigation) {
      return NextResponse.json({ error: "Investigation not found" }, { status: 404 });
    }
    if (investigation.orgId && investigation.orgId !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (mode === "fix" && investigation.approvalStatus !== "approved") {
      return NextResponse.json({ error: "Investigation must be approved before sending a fix to Devin" }, { status: 400 });
    }
  }

  // Load ticket
  const resolvedTicketId = ticketId ?? investigation?.ticketId;
  const ticket = resolvedTicketId
    ? await prisma.ticket.findUnique({
        where: { id: resolvedTicketId },
        include: { customer: true },
      })
    : null;

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Duplicate prevention
  const activeTask = await prisma.devinTask.findFirst({
    where: {
      investigationRunId: investigationRunId ?? undefined,
      mode,
      status: { notIn: TERMINAL_STATUSES },
    },
  });
  if (activeTask) {
    return NextResponse.json(
      { error: "An active Devin task already exists for this investigation and mode", existingTaskId: activeTask.id },
      { status: 409 }
    );
  }

  // Build context from investigation state
  const knowledgeStep = investigation?.steps.find((s) => s.agentName === "knowledge_retrieval");
  const logStep = investigation?.steps.find((s) => s.agentName === "log_analysis");
  const incidentStep = investigation?.steps.find((s) => s.agentName === "incident_correlation");
  const deployStep = investigation?.steps.find((s) => s.agentName === "deployment_correlation");
  const intakeStep = investigation?.steps.find((s) => s.agentName === "intake");

  // Resolve repository from server-side records, not browser input
  let resolvedRepo: string;
  if (repositoryId) {
    const codeRepo = await prisma.codeRepository.findUnique({ where: { id: repositoryId } });
    if (!codeRepo || !codeRepo.allowedForDevin) {
      return NextResponse.json({ error: "Repository not found or not allowed for Devin" }, { status: 400 });
    }
    resolvedRepo = `https://github.com/${codeRepo.repository}`;
  } else {
    // Fall back to product service mapping or default
    const productService = ticket.product
      ? await prisma.productService.findUnique({
          where: { name: ticket.product },
          include: { repository: true },
        })
      : null;
    resolvedRepo = productService?.repository
      ? `https://github.com/${productService.repository.repository}`
      : process.env.DEVIN_DEFAULT_REPO
        ?? "https://github.com/Trevorton27/support-buddy-demo-product";
  }

  const ctx: DevinTaskContext = {
    ticket: {
      title: ticket.title,
      description: ticket.description,
      severity: ticket.severity,
      category: ticket.category,
    },
    customer: {
      name: ticket.customer.name,
      company: ticket.customer.company,
      plan: ticket.customer.plan,
      region: ticket.customer.region,
    },
    hypotheses: (investigation?.hypotheses as unknown as Hypothesis[]) ?? [],
    logs: (logStep?.output as unknown as { logs?: LogEntry[] })?.logs ?? [],
    knowledgeChunks: (knowledgeStep?.output as unknown as { knowledgeChunks?: KnowledgeChunk[] })?.knowledgeChunks ?? [],
    incidents: (incidentStep?.output as unknown as { incidents?: CorrelatedIncident[] })?.incidents ?? [],
    deployments: (deployStep?.output as unknown as { deployments?: Deployment[] })?.deployments ?? [],
    classification: (intakeStep?.output as unknown as { classification?: DevinTaskContext["classification"] })?.classification ?? null,
    escalationNote: investigation?.escalationNote ?? null,
    repoUrl: resolvedRepo,
    approvedReply: mode === "fix" ? (investigation?.editedReply ?? investigation?.summary ?? null) : null,
    reviewerNote: mode === "fix" ? (investigation?.reviewerNote ?? null) : null,
  };

  const prompt = mode === "reproduce"
    ? buildReproductionPrompt(ctx)
    : buildFixPrompt(ctx);

  // Create DevinTask
  const devinTask = await prisma.devinTask.create({
    data: {
      orgId: orgId!,
      repository: resolvedRepo,
      mode,
      status: "queued",
      promptSnapshot: JSON.parse(JSON.stringify({ prompt })),
      createdBy: userId!,
      ticketId: ticket.id,
      investigationRunId: investigationRunId ?? null,
    },
  });

  // Create WorkItem
  const workItem = await createWorkItem({
    orgId: orgId!,
    type: "DEVIN_TASK",
    title: `Devin ${mode}: ${ticket.title}`,
    summary: `Devin AI ${mode === "reproduce" ? "reproduction" : "fix"} task for ticket "${ticket.title}"`,
    requiredAction: mode === "reproduce" ? "Monitor reproduction progress" : "Review PR when ready",
    ticketId: ticket.id,
    investigationRunId: investigationRunId ?? undefined,
    actorId: userId!,
    actorType: "user",
    priorityContext: {
      severity: ticket.severity === "critical" ? "critical" : ticket.severity === "high" ? "high" : "medium",
    },
  });

  // Link workItem to DevinTask
  await prisma.devinTask.update({
    where: { id: devinTask.id },
    data: { workItemId: workItem.id },
  });

  // Fire Inngest event
  await inngest.send({
    name: "devin/task.created",
    data: { devinTaskId: devinTask.id, orgId: orgId! },
  });

  return NextResponse.json({ id: devinTask.id, workItemId: workItem.id, status: "queued" }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/devin/tasks] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const mode = url.searchParams.get("mode");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = { orgId };
  if (status) where.status = status;
  if (mode) where.mode = mode;

  const [tasks, total] = await Promise.all([
    prisma.devinTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        ticket: { select: { id: true, title: true, severity: true } },
        investigationRun: { select: { id: true, status: true } },
      },
    }),
    prisma.devinTask.count({ where }),
  ]);

  return NextResponse.json({ tasks, total, limit, offset });
}
