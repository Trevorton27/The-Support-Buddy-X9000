import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SystemHealth } from "@/components/admin/system-health";
import { TicketGenerator } from "@/components/admin/ticket-generator";
import { IncidentCreator } from "@/components/admin/incident-creator";
import { KbPanel } from "@/components/admin/kb-panel";
import { HfIntegrations } from "@/components/admin/hf-integrations";
import { ShieldCheck } from "lucide-react";

async function getAdminData() {
  const [
    openTickets,
    criticalTickets,
    activeInvestigations,
    pendingApprovals,
    kbChunks,
    tokenData,
    customers,
    recentOpenTickets,
  ] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.ticket.count({ where: { severity: "critical", status: { in: ["open", "in_progress"] } } }),
    prisma.investigationRun.count({ where: { status: "running" } }),
    prisma.investigationRun.count({ where: { approvalStatus: "pending" } }),
    prisma.knowledgeChunk.count(),
    // Aggregate token usage across all agent steps
    prisma.agentStep.findMany({
      select: { tokenUsage: true },
    }),
    prisma.customer.findMany({
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
    }),
    prisma.ticket.findMany({
      where: { status: { in: ["open", "in_progress"] } },
      select: {
        id: true,
        title: true,
        severity: true,
        customer: { select: { company: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // Compute total token cost
  let totalTokens = 0;
  for (const step of tokenData) {
    const usage = step.tokenUsage as { totalTokens?: number } | null;
    if (usage?.totalTokens) totalTokens += usage.totalTokens;
  }
  const estimatedCost = (totalTokens / 1_000_000) * 0.60; // gpt-4o-mini output rate (conservative)

  return {
    openTickets,
    criticalTickets,
    activeInvestigations,
    pendingApprovals,
    kbChunks,
    totalTokens,
    estimatedCost,
    customers,
    recentOpenTickets,
  };
}

export default async function AdminPage() {
  const { userId, orgRole } = await auth();
  if (!userId) redirect("/sign-in");
  if (orgRole !== "owner" && orgRole !== "admin") redirect("/dashboard");

  const isHfLive = !!process.env.HUGGING_FACE_API_KEY;

  const {
    openTickets,
    criticalTickets,
    activeInvestigations,
    pendingApprovals,
    kbChunks,
    totalTokens,
    estimatedCost,
    customers,
    recentOpenTickets,
  } = await getAdminData();

  const healthStats = [
    { label: "Open Tickets", value: openTickets },
    { label: "Critical", value: criticalTickets, highlight: criticalTickets > 0 },
    { label: "Active Runs", value: activeInvestigations },
    { label: "Pending Approval", value: pendingApprovals, highlight: pendingApprovals > 0 },
    { label: "KB Chunks", value: kbChunks },
    {
      label: "Total Tokens",
      value: totalTokens.toLocaleString(),
      sub: `~$${estimatedCost.toFixed(4)}`,
    },
  ];

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Testing tools, pipeline controls, and HuggingFace integrations
          </p>
        </div>
      </div>

      <SystemHealth stats={healthStats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KbPanel />
        <HfIntegrations isHfLive={isHfLive} />
      </div>

      <TicketGenerator customers={customers} />

      <IncidentCreator
        openTickets={recentOpenTickets}
        customers={customers}
      />
    </div>
  );
}
