interface DistributionItem {
  label: string;
  count: number;
  color: string;
}

interface DifficultyDistributionChartProps {
  easy: number;
  medium: number;
  hard: number;
}

export function DifficultyDistributionChart({ easy, medium, hard }: DifficultyDistributionChartProps) {
  const total = easy + medium + hard;
  if (total === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">No generated tickets yet.</p>;
  }

  const items: DistributionItem[] = [
    { label: "Easy", count: easy, color: "bg-green-500" },
    { label: "Medium", count: medium, color: "bg-amber-500" },
    { label: "Hard", count: hard, color: "bg-red-500" },
  ];

  const maxBarHeight = 80;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 h-24 justify-center">
        {items.map((item) => {
          const pct = total > 0 ? (item.count / total) * 100 : 0;
          const height = Math.max(4, (item.count / Math.max(easy, medium, hard)) * maxBarHeight);
          return (
            <div key={item.label} className="flex flex-col items-center gap-1 w-20">
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{item.count}</span>
              <div
                className={`w-full ${item.color} rounded-t transition-all`}
                style={{ height: `${height}px` }}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
              <span className="text-xs font-mono text-slate-400">{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700" />
      <div className="grid grid-cols-3 gap-2 text-center">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{item.count}</div>
            <div className="text-xs text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
