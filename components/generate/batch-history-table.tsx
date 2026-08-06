import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

interface Batch {
  id: string;
  name: string;
  mode: string;
  status: string;
  totalRequested: number;
  totalCreated: number;
  startedAt: Date;
  _count: { metas: number };
}

interface BatchHistoryTableProps {
  batches: Batch[];
}

const STATUS_STYLES: Record<string, string> = {
  complete: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  running: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  pending: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  failed: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

const MODE_STYLES: Record<string, string> = {
  wizard: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  autonomous: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  incident: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
};

export function BatchHistoryTable({ batches }: BatchHistoryTableProps) {
  if (batches.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
        No batches yet. Use the wizard above to generate your first tickets.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Mode</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Tickets</th>
            <th className="px-4 py-3 text-left font-medium">Created</th>
            <th className="px-4 py-3 text-left font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
          {batches.map((batch) => (
            <tr key={batch.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                {batch.name}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={MODE_STYLES[batch.mode] ?? ""}>
                  {batch.mode}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={STATUS_STYLES[batch.status] ?? ""}>
                  {batch.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                {batch.totalCreated} / {batch.totalRequested}
              </td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                {formatRelativeTime(batch.startedAt)}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/generate/batches/${batch.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
