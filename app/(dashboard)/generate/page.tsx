import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { WizardLauncher } from "@/components/generate/wizard-launcher";
import { BatchHistoryTable } from "@/components/generate/batch-history-table";

export default async function GeneratePage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  const [batches, customers] = await Promise.all([
    prisma.generationBatch.findMany({
      where: { orgId: orgId ?? "" },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { _count: { select: { metas: true } } },
    }),
    prisma.customer.findMany({
      where: { orgId: orgId ?? "" },
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
      take: 50,
    }),
  ]);

  const totalTickets = batches.reduce((sum, b) => sum + b.totalCreated, 0);
  const pendingCount = batches.filter((b) => b.status === "pending" || b.status === "running").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ticket Generator</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Generate realistic support tickets for training, evaluation, and demos.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{batches.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Total Batches</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalTickets}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tickets Generated</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{pendingCount}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">In Progress</div>
        </div>
      </div>

      <WizardLauncher customers={customers} />

      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Batch History</h2>
        <BatchHistoryTable batches={batches} />
      </div>
    </div>
  );
}
