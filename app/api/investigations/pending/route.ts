import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runs = await prisma.investigationRun.findMany({
    where: { approvalStatus: "pending" },
    include: {
      ticket: { include: { customer: true } },
      steps: { orderBy: { startedAt: "asc" } },
    },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ runs, total: runs.length });
}
