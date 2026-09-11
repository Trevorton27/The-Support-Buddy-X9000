import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getZendeskAdapter } from "@/lib/integrations/zendesk";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");

  // Get a demo customer to attach the ticket to
  const customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId } })
    : await prisma.customer.findFirst({ where: { plan: "enterprise" } });

  if (!customer) return NextResponse.json({ error: "No customer found" }, { status: 404 });

  const adapter = getZendeskAdapter();
  const templates = adapter.getTickets();
  const template = templates[Math.floor(Math.random() * templates.length)];
  const zdTicket = adapter.createTicketFromTemplate(template.subject, template.description, customer.email);

  // Create a real ticket in our system
  const ticket = await prisma.ticket.create({
    data: {
      title: zdTicket.subject,
      description: zdTicket.description,
      severity: zdTicket.priority === "urgent" ? "critical" : zdTicket.priority === "high" ? "high" : "medium",
      status: "open",
      customerId: customer.id,
      externalId: `ZD-${zdTicket.id}`,
    },
    include: { customer: true },
  });

  return NextResponse.json({ ticket, zdTicket, source: "zendesk-simulate" });
}
