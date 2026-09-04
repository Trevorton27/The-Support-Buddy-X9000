// Shift Briefing — AI-generated workload summary
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildWorkContext } from "@/lib/work-context";
import { createLogger } from "@/lib/logger";
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";

const logger = createLogger("shift-briefing");

export async function generateBriefing(agentId: string, orgId: string): Promise<string> {
  const context = await buildWorkContext(agentId, orgId);
  const env = getEnv();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const promptPath = join(process.cwd(), "agents/prompts/shift-briefing.md");
  const systemPrompt = readFileSync(promptPath, "utf-8");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          activeCounts: context.activeCounts,
          topPriorities: context.topPriorities,
          risks: context.risks,
          recentChanges: context.recentChanges,
        }),
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const briefing = response.choices[0].message.content || "Unable to generate briefing.";

  // Store in AgentWorkContext
  await prisma.agentWorkContext.upsert({
    where: { agentId_orgId: { agentId, orgId } },
    update: { briefing, refreshedAt: new Date() },
    create: {
      agentId,
      orgId,
      summary: `Agent ${agentId} briefing`,
      briefing,
      activeCounts: JSON.parse(JSON.stringify(context.activeCounts)),
      topPriorities: JSON.parse(JSON.stringify(context.topPriorities)),
      risks: JSON.parse(JSON.stringify(context.risks)),
      recentChanges: JSON.parse(JSON.stringify(context.recentChanges)),
      sourceWorkItemIds: JSON.parse(JSON.stringify(context.sourceWorkItemIds)),
    },
  });

  logger.info("Briefing generated", { agentId, orgId, length: briefing.length });
  return briefing;
}
