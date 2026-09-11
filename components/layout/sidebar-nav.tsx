"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Ticket, Search, Settings, ClipboardCheck,
  AlertTriangle, FlaskConical, Users, ShieldCheck, BookOpen, Wand2,
  GraduationCap, Target, Bug, Bot, BrainCircuit, type LucideIcon,
} from "lucide-react";

// ─── Nav Configuration ───

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  preview: string;
  badge?: boolean;
  group: "operations" | "testing" | "config";
}

const navItems: NavItem[] = [
  // ── Operations ──
  {
    href: "/mission-control",
    label: "Mission Control",
    icon: Target,
    preview: "Unified work queue with AI-prioritized tasks, shift briefings, and real-time responsibility tracking",
    group: "operations",
  },
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    preview: "KPI dashboard with ticket volume, resolution times, and agent performance metrics",
    group: "operations",
  },
  {
    href: "/tickets",
    label: "Support Tickets",
    icon: Ticket,
    preview: "Browse, search, and manage all support tickets with customer context and history",
    group: "operations",
  },
  {
    href: "/investigations",
    label: "Investigations",
    icon: Search,
    preview: "AI-powered root cause analysis pipeline — view agent traces, hypotheses, and drafted replies",
    group: "operations",
  },
  {
    href: "/approvals",
    label: "Approval Queue",
    icon: ClipboardCheck,
    preview: "Review and approve AI-drafted customer responses before they're sent",
    badge: true,
    group: "operations",
  },
  {
    href: "/incidents",
    label: "Incidents",
    icon: AlertTriangle,
    preview: "Auto-clustered incidents from related tickets with severity tracking and status page management",
    group: "operations",
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    icon: BookOpen,
    preview: "RAG-indexed documentation that agents use for evidence-based responses",
    group: "operations",
  },
  {
    href: "/about-agents",
    label: "About Agents",
    icon: BrainCircuit,
    preview: "Learn how each agent in the investigation pipeline works to troubleshoot and triage support tickets",
    group: "operations",
  },
  {
    href: "/devin",
    label: "Devin AI",
    icon: Bot,
    preview: "Monitor Devin AI sessions — reproductions, fixes, and authored defects with live status tracking",
    group: "operations",
  },
  {
    href: "/team",
    label: "Team Members",
    icon: Users,
    preview: "Organization members, roles, and permissions",
    group: "operations",
  },

  // ── Testing & Training ──
  {
    href: "/generate",
    label: "Generate Sample Cases",
    icon: Wand2,
    preview: "Create realistic synthetic tickets for training the AI pipeline — wizard, autonomous, or incident modes",
    group: "testing",
  },
  {
    href: "/training",
    label: "Agent Training",
    icon: GraduationCap,
    preview: "Score and review AI investigation quality to improve agent performance over time",
    group: "testing",
  },
  {
    href: "/eval",
    label: "Eval Suite",
    icon: FlaskConical,
    preview: "Run evaluation benchmarks against golden test cases and track pass rates across dimensions",
    group: "testing",
  },
  {
    href: "/demo-lab",
    label: "Demo Lab",
    icon: FlaskConical,
    preview: "Activate reproducible bug scenarios, run full investigation demos, and test Devin AI end-to-end",
    group: "testing",
  },
  {
    href: "/bug-generator",
    label: "Bug Injector",
    icon: Bug,
    preview: "Inject and revert real code defects in the demo product repo for Devin AI testing",
    group: "testing",
  },

  // ── Config ──
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    preview: "Integration status, model configuration, and environment management",
    group: "config",
  },
];

const groupLabels: Record<string, string> = {
  operations: "Operations",
  testing: "Testing & Demos",
  config: "Configuration",
};

// ─── Fixed Tooltip Component ───

function NavTooltip({ text, anchor }: { text: string; anchor: { top: number; left: number } | null }) {
  if (!anchor) return null;
  return (
    <div
      className="fixed z-[100] w-64 pointer-events-none"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <div className="bg-slate-900 dark:bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-slate-700 leading-relaxed">
        {text}
        <div className="absolute top-2.5 -left-1 w-2 h-2 bg-slate-900 dark:bg-slate-800 border-l border-b border-slate-700 rotate-45" />
      </div>
    </div>
  );
}

// ─── Sidebar Nav ───

export function SidebarNav({
  pendingCount,
  isAdmin,
}: {
  pendingCount: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = useCallback((href: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setHoveredHref(href);
    setTooltipPos({ top: rect.top, left: rect.right + 8 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredHref(null);
    setTooltipPos(null);
  }, []);

  const groups = ["operations", "testing", "config"] as const;

  return (
    <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
      {groups.map((group) => {
        const items = navItems.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {groupLabels[group]}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <div
                    key={item.href}
                    onMouseEnter={(e) => handleMouseEnter(item.href, e.currentTarget)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && pendingCount > 0 && (
                        <span className="text-xs font-medium bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {isAdmin && (
        <div>
          <div
            onMouseEnter={(e) => handleMouseEnter("/admin", e.currentTarget)}
            onMouseLeave={handleMouseLeave}
          >
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === "/admin"
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium"
                  : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300"
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="flex-1">Admin</span>
            </Link>
          </div>
        </div>
      )}

      {/* Single tooltip rendered with fixed positioning to escape overflow clipping */}
      {hoveredHref && (
        <NavTooltip
          text={
            hoveredHref === "/admin"
              ? "System administration — user management, org settings, and platform configuration"
              : navItems.find((i) => i.href === hoveredHref)?.preview ?? ""
          }
          anchor={tooltipPos}
        />
      )}
    </nav>
  );
}
