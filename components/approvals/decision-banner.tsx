import Link from "next/link";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

interface DecisionBannerProps {
  decision: "approved" | "rejected";
  /** Ticket title of the decided item, when the banner is shown somewhere else (e.g. the next approval) */
  subject?: string;
  /** Link to the decided item, when the banner is shown somewhere else */
  viewHref?: string;
  nextRunId?: string | null;
}

export function DecisionBanner({ decision, subject, viewHref, nextRunId }: DecisionBannerProps) {
  const approved = decision === "approved";
  const Icon = approved ? CheckCircle2 : XCircle;
  const verb = approved ? "approved" : "rejected";

  return (
    <div
      role="status"
      className={`flex items-center gap-3 flex-wrap rounded-lg border px-4 py-3 text-sm animate-in fade-in slide-in-from-top-1 duration-300 ${
        approved
          ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300"
          : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="font-medium">
        {subject ? (
          <>
            You {verb} <span className="italic">{subject}</span>
          </>
        ) : (
          <>You {verb} this reply. {approved ? "Its progress is tracked below." : ""}</>
        )}
      </span>
      <div className="ml-auto flex items-center gap-4 text-xs">
        {viewHref && (
          <Link href={viewHref} className="font-medium hover:underline">
            View it
          </Link>
        )}
        {!viewHref && nextRunId && (
          <Link href={`/approvals/${nextRunId}`} className="inline-flex items-center gap-1 font-medium hover:underline">
            Next in queue <ArrowRight className="w-3 h-3" />
          </Link>
        )}
        {!viewHref && (
          <Link href="/approvals" className="hover:underline">
            Back to queue
          </Link>
        )}
      </div>
    </div>
  );
}
