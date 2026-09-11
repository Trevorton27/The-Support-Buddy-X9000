import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { IncidentHeader } from "@/components/incidents/incident-header";
import { AffectedCustomersTable } from "@/components/incidents/affected-customers-table";
import { StatusPageEditor } from "@/components/incidents/status-page-editor";
import { IncidentTimeline } from "@/components/incidents/incident-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

interface TimelineEvent {
  timestamp: string;
  event: string;
  author: string;
}

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  const incident = await prisma.incident.findUnique({
    where: { id },
    include: {
      tickets: {
        include: {
          ticket: {
            include: {
              customer: true,
              investigations: true,
            },
          },
        },
      },
    },
  });

  if (!incident) notFound();

  const affectedTickets = incident.tickets.map((it) => it.ticket);
  const timelineEvents = (incident.internalTimeline as unknown as TimelineEvent[]) ?? [];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="text-sm text-slate-500">
        <Link href="/incidents" className="hover:text-slate-900 dark:hover:text-slate-100">Incidents</Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-xs">{incident.id.slice(0, 8)}...</span>
      </div>

      <IncidentHeader incident={incident} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Customers + Status Page */}
        <div className="lg:col-span-2 space-y-6">
          <AffectedCustomersTable tickets={affectedTickets} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status Page Message</CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customer-facing update. Changes are saved immediately.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <StatusPageEditor incidentId={incident.id} initialMessage={incident.statusPageMessage} />
            </CardContent>
          </Card>

          {incident.rootCauseHypothesis && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Root Cause Hypothesis</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {incident.rootCauseHypothesis}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Timeline */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Internal Timeline</h2>
          <IncidentTimeline events={timelineEvents} />
        </div>
      </div>
    </div>
  );
}
