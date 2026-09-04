"use client";

import { Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface WaitingStateBadgeProps {
  waitingOn: string;
  status: string;
  createdAt: string;
}

export function WaitingStateBadge({ waitingOn, status, createdAt }: WaitingStateBadgeProps) {
  if (status !== "WAITING_CUSTOMER" && status !== "WAITING_INTERNAL") return null;

  const waitLabel = status === "WAITING_CUSTOMER" ? "Customer" : "Internal";

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
      <Clock className="w-2.5 h-2.5" />
      Waiting ({waitLabel}): {waitingOn}
      <span className="text-amber-500">· {formatRelativeTime(createdAt)}</span>
    </span>
  );
}
