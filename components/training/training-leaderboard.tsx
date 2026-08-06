interface DifficultyStats {
  difficulty: string;
  count: number;
  avgRootCauseScore: number;
  avgSeverityScore: number;
  avgDeceptionScore: number;
  avgOverallScore: number;
  passRate: number;
}

interface TrainingLeaderboardProps {
  stats: DifficultyStats[];
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-end">
        <span className={`text-xs font-mono ${pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-yellow-600" : "text-red-600 dark:text-red-400"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20",
  medium: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20",
  hard: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20",
};

export function TrainingLeaderboard({ stats }: TrainingLeaderboardProps) {
  const difficulties = ["easy", "medium", "hard"];
  const statsMap = Object.fromEntries(stats.map((s) => [s.difficulty, s]));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {difficulties.map((d) => {
        const s = statsMap[d];
        return (
          <div
            key={d}
            className={`rounded-xl border p-4 space-y-3 ${DIFFICULTY_COLORS[d] ?? ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm capitalize text-slate-900 dark:text-slate-100">{d}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {s ? `${s.count} session${s.count !== 1 ? "s" : ""}` : "No data"}
              </span>
            </div>

            {s ? (
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Root Cause</div>
                  <ScoreBar score={s.avgRootCauseScore} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Deception Resistance</div>
                  <ScoreBar score={s.avgDeceptionScore} />
                </div>
                <div className="pt-1 border-t border-current/10">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Pass Rate</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {Math.round(s.passRate * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">Run an investigation on a generated ticket to see scores here.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
