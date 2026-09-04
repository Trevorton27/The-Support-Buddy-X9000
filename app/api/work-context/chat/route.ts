import { NextRequest, NextResponse } from "next/server";
import { requireOrgAuth } from "@/lib/auth";
import { buildWorkContext } from "@/lib/work-context";
import { getEnv } from "@/lib/env";
import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { z } from "zod";

const bodySchema = z.object({ message: z.string().min(1).max(2000) });

export async function POST(request: NextRequest) {
  const { userId, orgId, response } = await requireOrgAuth();
  if (response) return response;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const context = await buildWorkContext(userId!, orgId!);

  // Build bounded context string (keep under 8k tokens ~32k chars)
  const contextStr = JSON.stringify({
    activeCounts: context.activeCounts,
    topPriorities: context.topPriorities,
    risks: context.risks,
    recentChanges: context.recentChanges.slice(0, 5),
  }).slice(0, 30000);

  const env = getEnv();
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const promptPath = join(process.cwd(), "agents/prompts/work-assistant.md");
  const systemPrompt = readFileSync(promptPath, "utf-8");

  const chatResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `${systemPrompt}\n\n## Current Context\n${contextStr}` },
      { role: "user", content: parsed.data.message },
    ],
    temperature: 0.3,
    max_tokens: 800,
  });

  const responseText = chatResponse.choices[0].message.content || "I couldn't generate a response.";

  // Extract cited work item IDs from context
  const citations = context.topPriorities
    .filter((p) => responseText.includes(p.title))
    .map((p) => ({ id: p.id, title: p.title }));

  return NextResponse.json({ response: responseText, citations });
}
