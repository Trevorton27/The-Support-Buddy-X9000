import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TicketList } from "@/components/tickets/ticket-list";

async function getTickets(searchParams: Record<string, string>) {
  const where: Record<string, unknown> = {};
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.severity) where.severity = searchParams.severity;

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      customer: true,
      investigations: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [
      { severity: "asc" },
      { createdAt: "desc" },
    ],
  });

  return tickets;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const params = await searchParams;
  const tickets = await getTickets(params);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Support Tickets</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{tickets.length} tickets</p>
      </div>
      <TicketList tickets={tickets} />
    </div>
  );
}
