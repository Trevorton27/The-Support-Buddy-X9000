import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { getEnv } from "@/lib/env";
import { z } from "zod";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function findDuplicateTicketId(
  newText: string,
  recentTickets: { id: string; title: string; description: string }[],
  apiKey: string
): Promise<string | null> {
  if (recentTickets.length === 0) return null;
  try {
    const inputs = [newText, ...recentTickets.map((t) => `${t.title} ${t.description.slice(0, 100)}`)];
    const res = await fetch(
      "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
      }
    );
    if (!res.ok) return null;
    const embeddings = (await res.json()) as number[][];
    if (!Array.isArray(embeddings) || embeddings.length < 2) return null;
    const [newEmb, ...restEmbs] = embeddings;
    let bestScore = 0;
    let bestId: string | null = null;
    for (let i = 0; i < restEmbs.length; i++) {
      const sim = cosineSimilarity(newEmb, restEmbs[i]);
      if (sim > bestScore) {
        bestScore = sim;
        bestId = recentTickets[i].id;
      }
    }
    return bestScore >= 0.92 ? bestId : null;
  } catch {
    return null;
  }
}

const createTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  customerId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const customerId = searchParams.get("customerId");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (customerId) where.customerId = customerId;

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        customer: true,
        investigations: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return NextResponse.json({ tickets, total, page, limit });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // HF dedup check — gracefully skipped if key not set
  let duplicateOfId: string | undefined;
  const hfKey = getEnv().HUGGING_FACE_API_KEY;
  if (hfKey) {
    const recentTickets = await prisma.ticket.findMany({
      where: { status: { in: ["open", "in_progress"] } },
      select: { id: true, title: true, description: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const newText = `${parsed.data.title} ${parsed.data.description.slice(0, 200)}`;
    const dupId = await findDuplicateTicketId(newText, recentTickets, hfKey);
    if (dupId) duplicateOfId = dupId;
  }

  const ticket = await prisma.ticket.create({
    data: {
      ...parsed.data,
      externalId: `TKT-${Date.now()}`,
      ...(duplicateOfId ? { duplicateOfId } : {}),
    },
    include: { customer: true },
  });

  // Phase 6: Fire ticket/created event for clustering
  await inngest.send({
    name: "ticket/created",
    data: { ticketId: ticket.id },
  });

  // Create WorkSignal for the new ticket and fire processing event
  const signal = await prisma.workSignal.create({
    data: {
      idempotencyKey: `ticket-created-${ticket.id}`,
      sourceSystem: "internal",
      eventType: "ticket.created",
      payload: JSON.parse(JSON.stringify({
        ticketId: ticket.id,
        title: ticket.title,
        severity: ticket.severity,
        customerId: ticket.customerId,
      })),
      orgId: ticket.orgId || "",
    },
  });

  await inngest.send({
    name: "work-signal/received",
    data: { signalId: signal.id },
  });

  return NextResponse.json({ ...ticket, duplicateOf: duplicateOfId ?? null }, { status: 201 });
}
