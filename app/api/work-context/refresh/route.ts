import { NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { refreshWorkContext } from "@/lib/work-context";
import { generateBriefing } from "@/lib/shift-briefing";
import { createLogger } from "@/lib/logger";

const logger = createLogger("work-context-refresh");

export async function POST() {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const context = await refreshWorkContext(userId!, orgId ?? "");

  // Generate AI briefing
  let briefing: string | null = null;
  try {
    briefing = await generateBriefing(userId!, orgId ?? "");
  } catch (err) {
    logger.error("Failed to generate briefing", { error: String(err) });
    // Fall back to a simple summary from context
    const counts = context.activeCounts as Record<string, number> | null;
    const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
    briefing = total > 0
      ? `You have ${total} active work items. Check the priority queue below for details.`
      : "No active work items. You're all caught up!";
  }

  return NextResponse.json({ ...context, briefing });
}
