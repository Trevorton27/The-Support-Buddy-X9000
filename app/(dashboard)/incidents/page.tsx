import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const statusStyles: Record<string, string> = {
  investigating: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  identified:    "bg-orange-100 text-orange-700 border-orange-200",
  monitoring:    "bg-yellow-100 text-yellow-700 border-yellow-200",
  resolved:      "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300",
};

const severityDot: Record<string, string> = {
  P0: "bg-red-500",
  P1: "bg-orange-500",
  P2: "bg-yellow-500",
};

export default async function IncidentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const incidents = await prisma.incident.findMany({
    include: { tickets: true },
    orderBy: { startedAt: "desc" },
  });

  const active = incidents.filter((i) => i.status !== "resolved");
  const resolved = incidents.filter((i) => i.status === "resolved");

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Incidents</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {active.length} active · {resolved.length} resolved
          </p>
        </div>
      </div>

      {incidents.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No incidents yet. Incidents are auto-detected when 3+ related tickets are opened within 4 hours.
          </p>
        </Card>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Active</h2>
          {active.map((incident) => (
            <Link key={incident.id} href={`/incidents/${incident.id}`}>
              <Card className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${severityDot[incident.severity] ?? "bg-slate-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{incident.title}</span>
                      <Badge variant="outline" className={`text-xs shrink-0 capitalize ${statusStyles[incident.status] ?? ""}`}>
                        {incident.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{incident.severity}</span>
                      <span>·</span>
                      <span>{incident.affectedProduct}</span>
                      <span>·</span>
                      <span>{incident.affectedRegion}</span>
                      <span>·</span>
                      <span>{incident.tickets.length} ticket{incident.tickets.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{formatRelativeTime(incident.startedAt)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Resolved</h2>
          {resolved.slice(0, 5).map((incident) => (
            <Link key={incident.id} href={`/incidents/${incident.id}`}>
              <Card className="p-4 opacity-60 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">{incident.title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{formatRelativeTime(incident.resolvedAt ?? incident.updatedAt)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
