import Link from "next/link";
import { DifficultyBadge } from "@/components/generate/difficulty-badge";

interface TrainingSession {
  runId: string;
  ticketTitle: string;
  difficulty: string;
  affectedProduct: string;
  overallScore: number | null;
  passed: boolean | null;
  investigationStatus: string;
}

interface TrainingSessionsTableProps {
  sessions: TrainingSession[];
}

export function TrainingSessionsTable({ sessions }: TrainingSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
        No training sessions yet. Run an investigation on a generated ticket, then visit the training run page to see your score.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Ticket</th>
            <th className="px-4 py-3 text-left font-medium">Difficulty</th>
            <th className="px-4 py-3 text-left font-medium">Product</th>
            <th className="px-4 py-3 text-right font-medium">Score</th>
            <th className="px-4 py-3 text-left font-medium">Result</th>
            <th className="px-4 py-3 text-left font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
          {sessions.map((s) => (
            <tr key={s.runId} className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                {s.ticketTitle}
              </td>
              <td className="px-4 py-3">
                <DifficultyBadge difficulty={s.difficulty} />
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{s.affectedProduct}</td>
              <td className="px-4 py-3 text-right tabular-nums font-mono">
                {s.overallScore !== null ? `${Math.round(s.overallScore * 100)}%` : "—"}
              </td>
              <td className="px-4 py-3">
                {s.passed !== null ? (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.passed
                      ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  }`}>
                    {s.passed ? "PASS" : "FAIL"}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Not scored</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/training/${s.runId}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                >
                  Review
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
