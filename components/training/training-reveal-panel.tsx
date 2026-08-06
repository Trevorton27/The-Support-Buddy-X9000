import { DifficultyBadge } from "@/components/generate/difficulty-badge";
import { Badge } from "@/components/ui/badge";

interface Hypothesis {
  title: string;
  confidence: number;
  evidence: string[];
}

interface RevealPanelProps {
  ticketTitle: string;
  // AI output
  topHypothesis: string;
  aiSeverity: string;
  hypotheses: Hypothesis[];
  // Hidden ground truth
  trueRootCause: string;
  trueSeverity: string;
  trueCategory: string;
  affectedProduct: string;
  injectedFaults: string[];
  difficulty: string;
  scenario: string | null;
  scenarioRole: string | null;
}

export function TrainingRevealPanel({
  ticketTitle,
  topHypothesis,
  aiSeverity,
  hypotheses,
  trueRootCause,
  trueSeverity,
  trueCategory,
  affectedProduct,
  injectedFaults,
  difficulty,
  scenario,
  scenarioRole,
}: RevealPanelProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: AI output */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">AI Investigation Output</h3>
          <Badge variant="outline" className="text-xs">agent result</Badge>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Top Hypothesis</div>
            <p className="text-sm text-slate-800 dark:text-slate-200 font-medium">{topHypothesis || "—"}</p>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Classified Severity</div>
            <Badge variant="outline" className="capitalize">{aiSeverity}</Badge>
          </div>
          {hypotheses.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">All Hypotheses</div>
              <div className="space-y-1.5">
                {hypotheses.slice(0, 4).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-slate-400 tabular-nums shrink-0">{h.confidence}%</span>
                    <span className="text-slate-700 dark:text-slate-300">{h.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Ground truth */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">Hidden Ground Truth</h3>
          <DifficultyBadge difficulty={difficulty} />
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 p-4 space-y-3">
          <div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mb-0.5 font-medium">True Root Cause</div>
            <p className="text-sm text-slate-800 dark:text-slate-200">{trueRootCause}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-amber-700 dark:text-amber-400 mb-0.5 font-medium">True Severity</div>
              <Badge variant="outline" className="capitalize">{trueSeverity}</Badge>
            </div>
            <div>
              <div className="text-xs text-amber-700 dark:text-amber-400 mb-0.5 font-medium">True Category</div>
              <span className="text-xs text-slate-700 dark:text-slate-300">{trueCategory}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mb-0.5 font-medium">Affected System</div>
            <span className="text-xs text-slate-700 dark:text-slate-300">{affectedProduct}</span>
          </div>
          {injectedFaults.length > 0 && (
            <div>
              <div className="text-xs text-amber-700 dark:text-amber-400 mb-1 font-medium">
                Injected Faults (red herrings)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {injectedFaults.map((f, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded border border-red-200 dark:border-red-800"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          {scenario && (
            <div className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-amber-200 dark:border-amber-800">
              Incident: <span className="font-medium">{scenario}</span>
              {scenarioRole && <span className="ml-1">({scenarioRole})</span>}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ticket: <span className="font-medium text-slate-600 dark:text-slate-400">{ticketTitle}</span>
        </p>
      </div>
    </div>
  );
}
