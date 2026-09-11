import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { z } from "zod";
import {
  listTemplates,
  getTemplate,
  injectBug,
  fixBug,
  getActiveBugs,
} from "@/lib/bug-generator/generator";

/**
 * GET /api/bug-generator
 * Lists all bug templates and their current status (active/inactive).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = listTemplates();
  const activeBugs = getActiveBugs();
  const activeIds = new Set(activeBugs.map((b) => b.templateId));

  return NextResponse.json({
    templates,
    activeBugs: activeBugs.length,
    activeIds: Array.from(activeIds),
  });
}

const actionSchema = z.object({
  action: z.enum(["inject", "fix", "inject-with-ticket"]),
  templateId: z.string().min(1),
  customerId: z.string().optional(),
});

/**
 * POST /api/bug-generator
 * Inject or fix a bug. Optionally create a matching support ticket.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { action, templateId, customerId } = parsed.data;

  if (action === "fix") {
    const result = fixBug(templateId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  // inject or inject-with-ticket
  const result = injectBug(templateId);
  if (!result.success) {
    return NextResponse.json(result, { status: 400 });
  }

  // Optionally create a matching ticket
  if (action === "inject-with-ticket") {
    const template = getTemplate(templateId);
    if (template?.ticket) {
      // Find a customer to assign
      const customer = customerId
        ? await prisma.customer.findUnique({ where: { id: customerId } })
        : await prisma.customer.findFirst({ orderBy: { createdAt: "asc" } });

      if (customer) {
        const ticket = await prisma.ticket.create({
          data: {
            title: template.ticket.title,
            description: template.ticket.description,
            severity: template.ticket.severity,
            category: template.ticket.category,
            product: template.ticket.product,
            status: "open",
            customerId: customer.id,
            orgId: customer.orgId,
          },
        });
        result.ticketId = ticket.id;

        // Fire ticket/created for clustering + GitHub sync
        await inngest.send({
          name: "ticket/created",
          data: { ticketId: ticket.id },
        });
      }
    }
  }

  return NextResponse.json(result, { status: 200 });
}
