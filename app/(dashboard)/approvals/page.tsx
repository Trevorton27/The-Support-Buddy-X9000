import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ApprovalQueueTable } from "@/components/approvals/approval-queue-table";
import { Card } from "@/components/ui/card";
import { ClipboardCheck } from "lucide-react";

async function getPendingRuns() {
  return prisma.investigationRun.findMany({
    where: { approvalStatus: "pending" },
    include: {
      ticket: { include: { customer: true } },
    },
    orderBy: { startedAt: "asc" }, // Oldest first (SLA order)
  });
}

export default async function ApprovalsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const runs = await getPendingRuns();

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="w-6 h-6 text-slate-700 dark:text-slate-300" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Approval Queue</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {runs.length === 0
              ? "All caught up — no investigations pending approval"
              : `${runs.length} investigation${runs.length !== 1 ? "s" : ""} awaiting human review`}
          </p>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <ApprovalQueueTable runs={runs} />
      </Card>
    </div>
  );
}
