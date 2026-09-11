import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { getEnv } from "@/lib/env";
import OpenAI from "openai";
import { z } from "zod";

const schema = z.object({
  subject: z.string().min(1).max(200),
  count: z.number().int().min(1).max(20),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  customerId: z.string().optional(),
  autoInvestigate: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const { userId, orgRole } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (orgRole !== "owner" && orgRole !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { subject, count, severity, customerId, autoInvestigate } = parsed.data;

  // Resolve customer pool
  let customerIds: string[];
  if (customerId) {
    customerIds = [customerId];
  } else {
    const customers = await prisma.customer.findMany({ select: { id: true } });
    if (customers.length === 0) {
      return NextResponse.json({ error: "No customers in database — run seed first" }, { status: 422 });
    }
    customerIds = customers.map((c) => c.id);
  }

  // Generate realistic ticket content with gpt-4o-mini
  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate realistic SaaS B2B support ticket content for testing AI triage pipelines. Each ticket should be distinct, specific, and include concrete error messages or symptoms. Do not repeat the same issue.",
      },
      {
        role: "user",
        content: `Generate exactly ${count} unique support tickets about: ${subject}.
Return a JSON object: { "tickets": [{ "title": "...", "description": "..." }] }
- title: 1 specific sentence describing the problem
- description: 2-4 sentences with error details, impact, and user context`,
      },
    ],
  });

  const generated = JSON.parse(response.choices[0].message.content || "{}") as {
    tickets?: { title: string; description: string }[];
  };
  const ticketDrafts = generated.tickets ?? [];

  // Create tickets + optionally trigger investigations
  const tickets = [];
  const investigationRunIds: string[] = [];

  for (let i = 0; i < ticketDrafts.length; i++) {
    const draft = ticketDrafts[i];
    if (!draft?.title || !draft?.description) continue;

    const resolvedCustomerId = customerIds[Math.floor(Math.random() * customerIds.length)];

    const ticket = await prisma.ticket.create({
      data: {
        title: draft.title,
        description: draft.description,
        severity,
        customerId: resolvedCustomerId,
        externalId: `TKT-ADMIN-${Date.now()}-${i}`,
      },
      include: { customer: true },
    });

    await inngest.send({ name: "ticket/created", data: { ticketId: ticket.id } });
    tickets.push(ticket);

    if (autoInvestigate) {
      const run = await prisma.investigationRun.create({
        data: { ticketId: ticket.id, status: "pending" },
      });
      await inngest.send({
        name: "investigation/run.requested",
        data: { ticketId: ticket.id, runId: run.id },
      });
      investigationRunIds.push(run.id);
    }
  }

  return NextResponse.json(
    { tickets, investigationRunIds: autoInvestigate ? investigationRunIds : undefined },
    { status: 201 }
  );
}
