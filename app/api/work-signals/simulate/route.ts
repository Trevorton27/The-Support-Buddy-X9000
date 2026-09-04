import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { getEmailAdapter } from "@/lib/integrations/email";
import { getInternalMessagingAdapter } from "@/lib/integrations/internal-messaging";
import { z } from "zod";

const schema = z.object({ count: z.number().min(1).max(20).default(5) });

export async function POST(request: NextRequest) {
  const { orgId, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const count = parsed.success ? parsed.data.count : 5;

  const email = getEmailAdapter();
  const messaging = getInternalMessagingAdapter();
  const created: string[] = [];

  for (let i = 0; i < count; i++) {
    const useEmail = Math.random() > 0.5;
    const source = useEmail ? email.receiveEmail() : messaging.receiveMessage();
    const key = `sim-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;

    const signal = await prisma.workSignal.create({
      data: {
        idempotencyKey: key,
        sourceSystem: useEmail ? "email" : "internal-messaging",
        eventType: source.eventType,
        payload: JSON.parse(JSON.stringify(source.payload)),
        evidence: source.evidence,
        orgId: orgId!,
      },
    });

    await inngest.send({
      name: "work-signal/received",
      data: { signalId: signal.id },
    });

    created.push(signal.id);
  }

  return NextResponse.json({ created, count: created.length }, { status: 201 });
}
