import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { retrieveKnowledge, formatEvidenceBlock } from "@/lib/knowledge-retrieval";

const bodySchema = z.object({
  /** Override the retrieval query — defaults to ticket title + description */
  query: z.string().max(2000).optional(),
  sourceTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  productArea: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
  minScore: z.number().min(0).max(1).default(0.3),
  includeFormattedBlock: z.boolean().default(false),
});

// POST /api/tickets/[ticketId]/retrieve-context
// Retrieves relevant knowledge base evidence for a ticket.
// Writes a RetrievalResult audit row linked to the ticket.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, title: true, description: true, category: true, product: true },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { includeFormattedBlock, query: queryOverride, ...options } = parsed.data;

  // Build a composite query from the ticket if no override supplied
  const query =
    queryOverride ??
    [
      ticket.title,
      ticket.description.slice(0, 300),
      ticket.category,
      ticket.product,
    ]
      .filter(Boolean)
      .join(" ");

  try {
    const evidence = await retrieveKnowledge(query, {
      ...options,
      ticketId: ticket.id,
      // Always write audit row for ticket-specific retrieval
      skipAudit: false,
    });

    return NextResponse.json({
      ticketId: ticket.id,
      query,
      evidence,
      total: evidence.length,
      ...(includeFormattedBlock
        ? { formattedBlock: formatEvidenceBlock(evidence) }
        : {}),
    });
  } catch (err) {
    return NextResponse.json({
      ticketId: ticket.id,
      query,
      evidence: [],
      total: 0,
      error: `Knowledge retrieval failed: ${(err as Error).message}`,
    });
  }
}
