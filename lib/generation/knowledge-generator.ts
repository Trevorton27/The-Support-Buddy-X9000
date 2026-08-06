import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const logger = createLogger("knowledge-generator");

type SourceType =
  | "RUNBOOK"
  | "INCIDENT_REPORT"
  | "PRODUCT_DOC"
  | "ARCHITECTURE_DOC"
  | "SUPPORT_TICKET"
  | "LOG_SUMMARY"
  | "EXTERNAL_DOC";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function generateKnowledgeDocuments(
  topics: string[],
  sourceType: SourceType,
  count: number
): Promise<{ filePath: string; content: string }[]> {
  const systemPrompt = readFileSync(
    join(process.cwd(), "agents/prompts/knowledge-generator.md"),
    "utf-8"
  );

  const client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });
  const results: { filePath: string; content: string }[] = [];

  const topicsToGenerate = topics.slice(0, count);
  // If fewer topics than count, cycle through topics
  const expandedTopics: string[] = [];
  for (let i = 0; i < count; i++) {
    expandedTopics.push(topicsToGenerate[i % topicsToGenerate.length]);
  }

  logger.info("Generating knowledge documents", { count, sourceType, topics });

  for (let i = 0; i < expandedTopics.length; i++) {
    const topic = expandedTopics[i];
    const suffix = i > 0 && expandedTopics[i] === expandedTopics[i - 1] ? `-${i}` : "";

    const userContent = `Write a ${sourceType} document about the following topic:\n\n${topic}\n\nMake it realistic and detailed. Output only the Markdown document content (including the front-matter header).`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 1500,
    });

    const content = response.choices[0].message.content ?? "";
    const sourceTypeSlug = sourceType.toLowerCase().replace(/_/g, "-");
    const topicSlug = slugify(topic);
    const filePath = `knowledge-base/generated/${sourceTypeSlug}/${topicSlug}${suffix}.md`;

    results.push({ filePath, content });
    logger.info("Generated knowledge document", { filePath });
  }

  return results;
}
