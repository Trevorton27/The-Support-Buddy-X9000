import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Bot } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { prisma } from "@/lib/db";

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
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">The Support Buddy X9000</span>
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

        <SidebarNav pendingCount={pendingCount} isAdmin={isAdmin} />

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
