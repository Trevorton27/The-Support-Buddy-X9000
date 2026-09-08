import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().default("local"),
  INNGEST_SIGNING_KEY: z.string().optional(),
  // Optional integrations (already existing)
  ANTHROPIC_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_BASE_URL: z.string().optional(),
  // Phase 4: HuggingFace reranker
  HUGGING_FACE_API_KEY: z.string().optional(),
  // Phase 5: Integration adapters
  SLACK_WEBHOOK_URL: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),
  ZENDESK_API_TOKEN: z.string().optional(),
  ZENDESK_SUBDOMAIN: z.string().optional(),
  // Devin AI: automated bug reproduction and code fixes
  DEVIN_API_KEY: z.string().optional(),
  DEVIN_DEFAULT_REPO: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.errors.map((e) => e.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }
  return result.data;
}

// Lazy parse so build doesn't fail if env not set
let _env: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!_env) _env = parseEnv();
  return _env;
}

export type Env = z.infer<typeof envSchema>;
