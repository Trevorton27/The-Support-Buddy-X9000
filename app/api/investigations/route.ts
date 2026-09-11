import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ticketId = searchParams.get("ticketId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (ticketId) where.ticketId = ticketId;
  if (status) where.status = status;

  const investigations = await prisma.investigationRun.findMany({
    where,
    include: {
      ticket: { include: { customer: true } },
      steps: { orderBy: { startedAt: "asc" } },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(investigations);
}
