import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createIncidentSchema = z.object({
  ticketIds: z.array(z.string()).min(1),
  title: z.string().min(1),
  severity: z.enum(["P0", "P1", "P2"]),
  affectedProduct: z.string().optional(),
  affectedRegion: z.string().optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incidents = await prisma.incident.findMany({
    include: {
      tickets: {
        include: { ticket: { include: { customer: true } } },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({ incidents });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ticketIds, title, severity, affectedProduct, affectedRegion } = parsed.data;

  // Derive product/region from first ticket if not provided
  const firstTicket = await prisma.ticket.findUnique({
    where: { id: ticketIds[0] },
    include: { customer: true },
  });

  const incident = await prisma.incident.create({
    data: {
      title,
      severity,
      affectedProduct: affectedProduct || firstTicket?.product || "Unknown",
      affectedRegion: affectedRegion || firstTicket?.customer.region || "Unknown",
      internalTimeline: JSON.parse(JSON.stringify([{
        timestamp: new Date().toISOString(),
        event: `Incident created with ${ticketIds.length} linked ticket(s)`,
        author: userId,
      }])),
      tickets: {
        create: ticketIds.map((ticketId) => ({ ticketId })),
      },
    },
    include: {
      tickets: { include: { ticket: { include: { customer: true } } } },
    },
  });

  return NextResponse.json(incident, { status: 201 });
}
