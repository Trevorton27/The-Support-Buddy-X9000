import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resumeWorkItem, transitionWorkItem } from "@/lib/work-items";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { id } = await params;
  const existing = await prisma.workItem.findFirst({ where: { id, orgId: orgId! } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // For OPEN/NEEDS_CLASSIFICATION items, transition to IN_PROGRESS (start)
    if (existing.status === "OPEN" || existing.status === "NEEDS_CLASSIFICATION") {
      const updated = await transitionWorkItem(id, "IN_PROGRESS", userId!, "user");
      return NextResponse.json(updated);
    }
    // For WAITING/SNOOZED items, resume to OPEN
    const updated = await resumeWorkItem(id, userId!);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
