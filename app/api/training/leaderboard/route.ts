import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { auth } from "@clerk/nextjs/server";

interface DifficultyStats {
  difficulty: string;
  count: number;
  avgRootCauseScore: number;
  avgSeverityScore: number;
  avgDeceptionScore: number;
  avgOverallScore: number;
  passRate: number;
}

export async function GET() {
  const { response: authError } = await requireAuth();
  if (authError) return authError;

  const { orgId } = await auth();

  const metas = await prisma.generatedTicketMeta.findMany({
    where: {
      scoredAt: { not: null },
      batch: { orgId: orgId ?? "" },
    },
    select: {
      difficulty: true,
      scoreCache: true,
    },
  });

  const groups: Record<string, DifficultyStats> = {};

  for (const meta of metas) {
    const cache = meta.scoreCache as Record<string, unknown> | null;
    if (!cache) continue;

    const d = meta.difficulty;
    if (!groups[d]) {
      groups[d] = {
        difficulty: d,
        count: 0,
        avgRootCauseScore: 0,
        avgSeverityScore: 0,
        avgDeceptionScore: 0,
        avgOverallScore: 0,
        passRate: 0,
      };
    }

    groups[d].count++;
    groups[d].avgRootCauseScore += typeof cache.rootCauseScore === "number" ? cache.rootCauseScore : 0;
    groups[d].avgSeverityScore += typeof cache.severityScore === "number" ? cache.severityScore : 0;
    groups[d].avgDeceptionScore += typeof cache.deceptionResistanceScore === "number" ? cache.deceptionResistanceScore : 0;
    groups[d].avgOverallScore += typeof cache.overallScore === "number" ? cache.overallScore : 0;
    groups[d].passRate += cache.passed === true ? 1 : 0;
  }

  const stats = Object.values(groups).map((g) => ({
    ...g,
    avgRootCauseScore: g.count > 0 ? g.avgRootCauseScore / g.count : 0,
    avgSeverityScore: g.count > 0 ? g.avgSeverityScore / g.count : 0,
    avgDeceptionScore: g.count > 0 ? g.avgDeceptionScore / g.count : 0,
    avgOverallScore: g.count > 0 ? g.avgOverallScore / g.count : 0,
    passRate: g.count > 0 ? g.passRate / g.count : 0,
  }));

  return NextResponse.json({ stats });
}
