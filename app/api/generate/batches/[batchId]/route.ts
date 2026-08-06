import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { orgId, response: authError } = await requireOrgAuth();
  if (authError) return authError;

  const { batchId } = await params;

  const batch = await prisma.generationBatch.findFirst({
    where: { id: batchId, orgId: orgId! },
    include: {
      metas: {
        include: {
          ticket: {
            select: { id: true, title: true, severity: true, status: true, createdAt: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}
