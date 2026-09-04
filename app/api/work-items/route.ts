import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createWorkItem } from "@/lib/work-items";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const assigneeId = searchParams.get("assigneeId") ?? userId;
  const priorityBand = searchParams.get("priorityBand");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const page = parseInt(searchParams.get("page") || "1");

  const where: Record<string, unknown> = { orgId };
  if (assigneeId && assigneeId !== "all") where.assigneeId = assigneeId;
  if (status) where.status = status;
  if (type) where.type = type;
  if (priorityBand) where.priorityBand = priorityBand;

  const [items, total] = await Promise.all([
    prisma.workItem.findMany({
      where,
      include: {
        ticket: { select: { id: true, title: true, severity: true, customer: { select: { name: true, company: true, plan: true } } } },
        incident: { select: { id: true, title: true, severity: true } },
        investigationRun: { select: { id: true, status: true } },
      },
      orderBy: { priorityScore: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.workItem.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

const createSchema = z.object({
  type: z.string(),
  title: z.string().min(1),
  summary: z.string().optional(),
  requiredAction: z.string().optional(),
  reason: z.string().optional(),
  assigneeId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  ticketId: z.string().optional(),
  investigationRunId: z.string().optional(),
  incidentId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await createWorkItem({
    orgId: orgId!,
    ...parsed.data,
    assigneeId: parsed.data.assigneeId ?? userId!,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
    actorId: userId!,
    actorType: "user",
  });

  return NextResponse.json(item, { status: 201 });
}
