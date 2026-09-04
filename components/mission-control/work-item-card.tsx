"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare, ArrowUpRight, Search, Shield, AlertTriangle,
  Clock, FileText, CheckSquare, ChevronDown, ChevronUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WorkItemActions } from "./work-item-actions";
import { PriorityExplanation } from "./priority-explanation";
import { WaitingStateBadge } from "./waiting-state-badge";

const TYPE_ICONS: Record<string, typeof MessageSquare> = {
  CUSTOMER_REPLY: MessageSquare,
  INTERNAL_FOLLOW_UP: ArrowUpRight,
  INVESTIGATION: Search,
  ESCALATION: Shield,
  APPROVAL: CheckSquare,
  INCIDENT_UPDATE: AlertTriangle,
  SCHEDULED_CHECK: Clock,
  DOCUMENTATION: FileText,
  MANUAL_TASK: CheckSquare,
};

const BAND_STYLES: Record<string, { border: string; badge: string }> = {
  URGENT: { border: "border-l-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  HIGH: { border: "border-l-orange-500", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  MEDIUM: { border: "border-l-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  LOW: { border: "border-l-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

export interface WorkItemData {
  id: string;
  type: string;
  status: string;
  title: string;
  summary: string | null;
  requiredAction: string | null;
  priorityScore: number;
  priorityBand: string;
  dueAt: string | null;
  snoozedUntil: string | null;
  waitingOn: string | null;
  confidence: number | null;
  ticketId: string | null;
  investigationRunId: string | null;
  incidentId: string | null;
  createdAt: string;
  ticket?: { id: string; title: string; severity: string; customer: { name: string; company: string; plan: string } } | null;
  incident?: { id: string; title: string; severity: string } | null;
  investigationRun?: { id: string; status: string } | null;
}

interface WorkItemCardProps {
  item: WorkItemData;
  onUpdate?: () => void;
}

export function WorkItemCard({ item, onUpdate }: WorkItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[item.type] ?? CheckSquare;
  const styles = BAND_STYLES[item.priorityBand] ?? BAND_STYLES.MEDIUM;

  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg border-l-4 ${styles.border}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Icon className="w-4 h-4 mt-0.5 text-slate-500 dark:text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {item.title}
              </h3>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${styles.badge}`}>
                {item.priorityBand}
              </Badge>
              <span className="text-[10px] text-slate-400">{Math.round(item.priorityScore)}/100</span>
              {item.confidence !== null && item.confidence < 0.6 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  Low confidence
                </Badge>
              )}
            </div>

            {item.ticket?.customer && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {item.ticket.customer.name} ({item.ticket.customer.company})
                {item.ticket.customer.plan === "enterprise" && (
                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">Enterprise</Badge>
                )}
              </div>
            )}

            {item.summary && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{item.summary}</p>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {item.waitingOn && <WaitingStateBadge waitingOn={item.waitingOn} status={item.status} createdAt={item.createdAt} />}

              {item.dueAt && (
                <span className={`text-[10px] ${new Date(item.dueAt).getTime() < Date.now() ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500"}`}>
                  Due {new Date(item.dueAt).toLocaleString()}
                </span>
              )}

              {item.ticketId && (
                <Link href={`/tickets/${item.ticketId}`} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                  View ticket
                </Link>
              )}
              {item.investigationRunId && (
                <Link href={`/investigations/${item.investigationRunId}`} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                  View investigation
                </Link>
              )}
              {item.incidentId && (
                <Link href={`/incidents/${item.incidentId}`} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                  View incident
                </Link>
              )}

              <button onClick={() => setExpanded(!expanded)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 space-y-3">
          {item.requiredAction && (
            <div className="text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Suggested action: </span>
              <span className="text-slate-600 dark:text-slate-400">{item.requiredAction}</span>
            </div>
          )}
          <PriorityExplanation score={item.priorityScore} band={item.priorityBand} />
          <WorkItemActions item={item} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
