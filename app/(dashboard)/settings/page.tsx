import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationCard } from "@/components/settings/integration-card";
import { DemoReset } from "@/components/settings/demo-reset";
import { AlertTriangle } from "lucide-react";

const integrations = [
  {
    name: "Sentry",
    type: "sentry",
    description: "Error event correlation during investigations",
    envKey: "SENTRY_AUTH_TOKEN",
    testEndpoint: undefined as string | undefined,
  },
  {
    name: "Datadog",
    type: "datadog",
    description: "Supplemental log enrichment for log analysis agent",
    envKey: "DATADOG_API_KEY",
    testEndpoint: undefined as string | undefined,
  },
  {
    name: "Slack",
    type: "slack",
    description: "Post approval summaries and escalation notifications",
    envKey: "SLACK_WEBHOOK_URL",
    testEndpoint: "/api/integrations/slack/test",
  },
  {
    name: "Zendesk",
    type: "zendesk",
    description: "Import tickets and simulate customer submissions",
    envKey: "ZENDESK_API_TOKEN",
    testEndpoint: "/api/integrations/zendesk/simulate",
  },
  {
    name: "GitHub",
    type: "github",
    description: "Create escalation issues in repositories",
    envKey: "GITHUB_TOKEN",
    testEndpoint: undefined as string | undefined,
  },
  {
    name: "Jira",
    type: "jira",
    description: "Create escalation tickets in Jira projects",
    envKey: "JIRA_API_TOKEN",
    testEndpoint: undefined as string | undefined,
  },
  {
    name: "Hugging Face",
    type: "huggingface",
    description: "Cross-encoder reranking for knowledge retrieval (cross-encoder/ms-marco-MiniLM-L-6-v2)",
    envKey: "HUGGING_FACE_API_KEY",
    testEndpoint: undefined as string | undefined,
  },
  {
    name: "Devin",
    type: "devin",
    description: "Automated bug reproduction and code fixes via Cognition AI",
    envKey: "DEVIN_API_KEY",
    testEndpoint: "/api/integrations/devin/test",
  },
];

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Determine live status server-side (safe — these are server env vars, never sent to client)
  const liveStatus: Record<string, boolean> = {};
  for (const integration of integrations) {
    liveStatus[integration.name] = !!process.env[integration.envKey];
  }

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure your AI support platform</p>
      </div>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Model</CardTitle>
          <CardDescription>Models used for agent reasoning and classification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">Reasoning: gpt-4o</Badge>
            <Badge variant="outline" className="text-xs">Classification: gpt-4o-mini</Badge>
            <Badge variant="outline" className="text-xs">Embeddings: text-embedding-3-small</Badge>
            <Badge variant="outline" className="text-xs">Guardrails: gpt-4o-mini</Badge>
            <Badge variant="outline" className="text-xs">Eval judge: gpt-4o-mini</Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Model selection is configured in <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">lib/env.ts</code> and agent node files.
          </p>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>
            Live when the environment variable is set; mock data otherwise — no code changes required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.name}
              name={integration.name}
              type={integration.type}
              description={integration.description}
              isLive={liveStatus[integration.name] ?? false}
              testEndpoint={integration.testEndpoint}
            />
          ))}
        </CardContent>
      </Card>

      {/* Demo Reset */}
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Demo Reset
          </CardTitle>
          <CardDescription>Clear all investigation data and restore demo tickets</CardDescription>
        </CardHeader>
        <CardContent>
          <DemoReset />
        </CardContent>
      </Card>
    </div>
  );
}
