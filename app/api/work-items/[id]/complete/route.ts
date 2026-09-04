import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { completeWorkItem } from "@/lib/work-items";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { id } = await params;
  const existing = await prisma.workItem.findFirst({ where: { id, orgId: orgId! } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  try {
    const updated = await completeWorkItem(id, userId!, body.note);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
