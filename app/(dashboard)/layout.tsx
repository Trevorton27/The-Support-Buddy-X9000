import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { LayoutDashboard, Ticket, Search, Settings, Zap, ClipboardCheck, AlertTriangle, FlaskConical, Users, ShieldCheck, BookOpen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { prisma } from "@/lib/db";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/investigations", label: "Investigations", icon: Search },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck, badge: true },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/eval", label: "Eval", icon: FlaskConical },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

async function getPendingApprovalCount() {
  try {
    return await prisma.investigationRun.count({
      where: { approvalStatus: "pending" },
    });
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgRole } = await auth();
  const isAdmin = orgRole === "org:admin";
  const pendingCount = userId ? await getPendingApprovalCount() : 0;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Support Ops AI</span>
        </div>

        {/* Org switcher */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <OrganizationSwitcher
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger: "w-full justify-start text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md px-2 py-1.5",
              },
            }}
          />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && pendingCount > 0 && (
                <span className="text-xs font-medium bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none">
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="flex-1">Admin</span>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Account</span>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}
