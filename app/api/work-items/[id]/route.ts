import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { id } = await params;

  const item = await prisma.workItem.findFirst({
    where: { id, orgId: orgId! },
    include: {
      ticket: { select: { id: true, title: true, severity: true, customer: { select: { name: true, company: true, plan: true } } } },
      incident: { select: { id: true, title: true, severity: true } },
      investigationRun: { select: { id: true, status: true } },
      events: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  requiredAction: z.string().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.workItem.findFirst({ where: { id, orgId: orgId! } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.summary !== undefined) data.summary = parsed.data.summary;
  if (parsed.data.requiredAction !== undefined) data.requiredAction = parsed.data.requiredAction;
  if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (parsed.data.assigneeId !== undefined) data.assigneeId = parsed.data.assigneeId;

  const updated = await prisma.workItem.update({ where: { id }, data });

  return NextResponse.json(updated);
}
