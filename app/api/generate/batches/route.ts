import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { generateTicketBatch } from "@/lib/generation/ticket-generator";
import { GenerationParamsSchema } from "@/lib/generation/schema";
import type { GenerationParams } from "@/lib/generation/types";

const SYNC_BATCH_LIMIT = 25;

export async function POST(req: NextRequest) {
  const { userId, orgId, response: authError } = await requireOrgAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = GenerationParamsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params", details: parsed.error.flatten() }, { status: 400 });
  }

  const inputParams = parsed.data;
  const params: GenerationParams = { ...inputParams, orgId: orgId! };

  // Resolve customer — try org-scoped first, fall back to any customer
  let customerId = params.customerId;
  if (!customerId) {
    const customer =
      (orgId
        ? await prisma.customer.findFirst({ where: { orgId }, orderBy: { createdAt: "asc" } })
        : null) ??
      (await prisma.customer.findFirst({ orderBy: { createdAt: "asc" } }));

    if (!customer) {
      return NextResponse.json(
        { error: "No customers in database. Run 'npm run seed' to load demo data." },
        { status: 422 }
      );
    }
    customerId = customer.id;
  }

  const batchName =
    params.mode === "incident" && params.incidentScenario
      ? params.incidentScenario.name
      : `${params.mode} batch — ${params.count} tickets`;

  const batch = await prisma.generationBatch.create({
    data: {
      name: batchName,
      status: "pending",
      mode: params.mode,
      params: JSON.parse(JSON.stringify(params)),
      totalRequested: params.count,
      orgId: orgId!,
      createdBy: userId!,
    },
  });

  // Sync path: ≤ SYNC_BATCH_LIMIT tickets
  if (params.count <= SYNC_BATCH_LIMIT) {
    try {
      await prisma.generationBatch.update({ where: { id: batch.id }, data: { status: "running" } });

      const drafts = await generateTicketBatch(params, batch.id);
      const ticketIds: string[] = [];

      for (const draft of drafts) {
        const ticket = await prisma.ticket.create({
          data: {
            title: draft.title,
            description: draft.description,
            severity: draft.severity,
            category: draft.category,
            product: draft.product,
            status: "open",
            customerId,
            orgId: orgId!,
          },
        });

        await prisma.generatedTicketMeta.create({
          data: {
            ticketId: ticket.id,
            batchId: batch.id,
            trueRootCause: draft.trueRootCause,
            trueCategory: draft.trueCategory,
            trueSeverity: draft.trueSeverity,
            affectedProduct: draft.affectedProduct,
            injectedFaults: JSON.parse(JSON.stringify(draft.injectedFaults)),
            scenario: draft.scenarioRole ? (params.incidentScenario?.name ?? null) : null,
            scenarioRole: draft.scenarioRole ?? null,
            difficulty: draft.difficulty,
          },
        });

        await inngest.send({ name: "ticket/created", data: { ticketId: ticket.id } });
        ticketIds.push(ticket.id);
      }

      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: { status: "complete", completedAt: new Date(), totalCreated: ticketIds.length },
      });

      return NextResponse.json({ batchId: batch.id, ticketIds, status: "complete" }, { status: 201 });
    } catch (err) {
      await prisma.generationBatch.update({
        where: { id: batch.id },
        data: { status: "failed", errorMessage: String(err), completedAt: new Date() },
      });
      return NextResponse.json({ error: "Generation failed", details: String(err) }, { status: 500 });
    }
  }

  // Async path: > SYNC_BATCH_LIMIT — fire Inngest
  await inngest.send({
    name: "generation/batch.requested",
    data: { batchId: batch.id, params },
  });

  return NextResponse.json({ batchId: batch.id, ticketIds: [], status: "pending" }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const { orgId, response: authError } = await requireOrgAuth();
  if (authError) return authError;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const mode = url.searchParams.get("mode") ?? undefined;
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageSize = 20;

  const batches = await prisma.generationBatch.findMany({
    where: {
      orgId: orgId!,
      ...(status ? { status } : {}),
      ...(mode ? { mode } : {}),
    },
    orderBy: { startedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { _count: { select: { metas: true } } },
  });

  return NextResponse.json({ batches });
}
