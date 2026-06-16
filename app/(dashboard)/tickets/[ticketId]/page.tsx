import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { InvestigationPanel } from "@/components/tickets/investigation-panel";
import { TicketContextPanel } from "@/components/knowledge/ticket-context-panel";

async function getTicket(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      customer: true,
      investigations: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          steps: { orderBy: { startedAt: "asc" } },
        },
      },
      incidents: {
        include: { incident: true },
        take: 1,
      },
    },
  });
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { ticketId } = await params;
  const ticket = await getTicket(ticketId);
  if (!ticket) notFound();

  const latestRun = ticket.investigations[0] ?? null;
  const linkedIncident = ticket.incidents[0]?.incident ?? null;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">
            <a href="/tickets" className="hover:text-slate-900 dark:hover:text-slate-100">Tickets</a>
            <span className="mx-2">/</span>
            <span>{ticket.externalId}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{ticket.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TicketDetail ticket={ticket} linkedIncident={linkedIncident} />
        </div>
        <div className="space-y-6">
          <InvestigationPanel ticket={ticket} latestRun={latestRun} />
          <TicketContextPanel ticketId={ticket.id} />
        </div>
      </div>
    </div>
  );
}
