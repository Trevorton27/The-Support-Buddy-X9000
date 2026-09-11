import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]).optional(),
  statusPageMessage: z.string().optional(),
  rootCauseHypothesis: z.string().optional(),
  resolvedAt: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      tickets: {
        include: { ticket: { include: { customer: true, investigations: { take: 1, orderBy: { startedAt: "desc" } } } } },
      },
    },
  });

  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(incident);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const incident = await prisma.incident.findUnique({ where: { id } });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existingTimeline = (incident.internalTimeline as Array<{ timestamp: string; event: string; author: string }>) ?? [];

  const updated = await prisma.incident.update({
    where: { id },
    data: {
      ...parsed.data,
      resolvedAt: parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : undefined,
      internalTimeline: JSON.parse(JSON.stringify([
        ...existingTimeline,
        {
          timestamp: new Date().toISOString(),
          event: `Status updated to "${parsed.data.status ?? incident.status}" by analyst`,
          author: userId,
        },
      ])),
    },
  });

  return NextResponse.json(updated);
}
