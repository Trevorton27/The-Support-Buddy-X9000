import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const page = parseInt(searchParams.get("page") || "1");

  const where: Record<string, unknown> = { orgId };
  if (status) where.processingStatus = status;

  const [signals, total] = await Promise.all([
    prisma.workSignal.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { workItem: { select: { id: true, title: true, status: true } } },
    }),
    prisma.workSignal.count({ where }),
  ]);

  return NextResponse.json({ signals, total, page, limit });
}

const receiveSchema = z.object({
  idempotencyKey: z.string().min(1),
  sourceSystem: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.unknown()),
  evidence: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json();
  const parsed = receiveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Check idempotency
  const existing = await prisma.workSignal.findUnique({ where: { idempotencyKey: parsed.data.idempotencyKey } });
  if (existing) return NextResponse.json({ signal: existing, deduplicated: true });

  const signal = await prisma.workSignal.create({
    data: {
      ...parsed.data,
      payload: JSON.parse(JSON.stringify(parsed.data.payload)),
      orgId: orgId!,
    },
  });

  await inngest.send({
    name: "work-signal/received",
    data: { signalId: signal.id },
  });

  return NextResponse.json({ signal, deduplicated: false }, { status: 201 });
}
