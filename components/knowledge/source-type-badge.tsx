import { cn } from "@/lib/utils";

const SOURCE_TYPE_STYLES: Record<string, string> = {
  RUNBOOK:          "bg-blue-50   text-blue-700   border-blue-200   dark:bg-blue-950/40   dark:text-blue-300   dark:border-blue-800",
  SUPPORT_TICKET:   "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  INCIDENT_REPORT:  "bg-red-50    text-red-700    border-red-200    dark:bg-red-950/40    dark:text-red-300    dark:border-red-800",
  PRODUCT_DOC:      "bg-green-50  text-green-700  border-green-200  dark:bg-green-950/40  dark:text-green-300  dark:border-green-800",
  ARCHITECTURE_DOC: "bg-teal-50   text-teal-700   border-teal-200   dark:bg-teal-950/40   dark:text-teal-300   dark:border-teal-800",
  ALERT:            "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-950/40  dark:text-amber-300  dark:border-amber-800",
  LOG_SUMMARY:      "bg-slate-100 text-slate-600  border-slate-300  dark:bg-slate-800     dark:text-slate-300  dark:border-slate-700",
  EXTERNAL_DOC:     "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  RUNBOOK:          "Runbook",
  SUPPORT_TICKET:   "Ticket",
  INCIDENT_REPORT:  "Incident",
  PRODUCT_DOC:      "Product Doc",
  ARCHITECTURE_DOC: "Architecture",
  ALERT:            "Alert",
  LOG_SUMMARY:      "Log Summary",
  EXTERNAL_DOC:     "External Doc",
};

export function SourceTypeBadge({
  sourceType,
  className,
}: {
  sourceType: string;
  className?: string;
}) {
  const style = SOURCE_TYPE_STYLES[sourceType] ?? SOURCE_TYPE_STYLES.PRODUCT_DOC;
  const label = SOURCE_TYPE_LABELS[sourceType] ?? sourceType;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}

export { SOURCE_TYPE_STYLES, SOURCE_TYPE_LABELS };
