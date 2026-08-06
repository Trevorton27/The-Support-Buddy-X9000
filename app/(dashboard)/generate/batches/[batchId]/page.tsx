import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ExportButtons } from "@/components/generate/export-buttons";
import { DifficultyBadge } from "@/components/generate/difficulty-badge";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const STATUS_STYLES: Record<string, string> = {
  complete: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  running: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  pending: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
  failed: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const { batchId } = await params;

  const batch = await prisma.generationBatch.findFirst({
    where: { id: batchId, orgId: orgId ?? "" },
    include: {
      metas: {
        include: {
          ticket: {
            select: { id: true, title: true, severity: true, status: true, createdAt: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!batch) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
            <Link href="/generate" className="hover:text-slate-700 dark:hover:text-slate-200">Generate</Link>
            <span>/</span>
            <span>Batch</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{batch.name}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="outline" className={STATUS_STYLES[batch.status] ?? ""}>
            {batch.status}
          </Badge>
          <Badge variant="outline" className="capitalize">{batch.mode}</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{batch.totalCreated}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Created</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{batch.totalRequested}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Requested</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {batch.metas.filter((m) => m.difficulty === "hard").length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Hard tickets</div>
        </div>
      </div>

      {batch.status === "complete" && batch.metas.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Export:</span>
          <ExportButtons batchId={batch.id} />
        </div>
      )}

      {batch.errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          Error: {batch.errorMessage}
        </div>
      )}

      {/* Ticket table — operator view, shows ground truth */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
          Tickets ({batch.metas.length})
        </h2>
        {batch.metas.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {batch.status === "pending" || batch.status === "running"
              ? "Generation in progress…"
              : "No tickets created."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Difficulty</th>
                  <th className="px-4 py-3 text-left font-medium">Severity</th>
                  <th className="px-4 py-3 text-left font-medium">True Root Cause</th>
                  <th className="px-4 py-3 text-left font-medium">Red Herrings</th>
                  <th className="px-4 py-3 text-left font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
                {batch.metas.map((meta) => (
                  <tr key={meta.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 max-w-xs">
                      <div className="truncate">{meta.ticket.title}</div>
                    </td>
                    <td className="px-4 py-3">
                      <DifficultyBadge difficulty={meta.difficulty} />
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 capitalize">
                      {meta.ticket.severity}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-xs">
                      <div className="truncate text-xs">{meta.trueRootCause}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs tabular-nums text-slate-500">
                        {Array.isArray(meta.injectedFaults) ? (meta.injectedFaults as string[]).length : 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/tickets/${meta.ticketId}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                      >
                        Ticket
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
