import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setWaiting } from "@/lib/work-items";
import { z } from "zod";

const schema = z.object({
  waitingOn: z.string().min(1),
  type: z.enum(["WAITING_CUSTOMER", "WAITING_INTERNAL"]).default("WAITING_INTERNAL"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const { id } = await params;
  const existing = await prisma.workItem.findFirst({ where: { id, orgId: orgId! } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const updated = await setWaiting(id, parsed.data.waitingOn, parsed.data.type, userId!);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
