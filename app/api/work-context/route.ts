import { NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const context = await prisma.agentWorkContext.findUnique({
    where: { agentId_orgId: { agentId: userId!, orgId: orgId! } },
  });

  if (!context) {
    return NextResponse.json({ summary: "No context generated yet. Click Refresh to generate.", activeCounts: {}, topPriorities: [], risks: [] });
  }

  return NextResponse.json(context);
}
