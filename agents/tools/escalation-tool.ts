import { createLogger } from "@/lib/logger";

const logger = createLogger("escalation-tool");

interface EscalationPayload {
  title: string;
  severity: string;
  priority: string;
  body: string;
  labels?: string[];
}

export async function postEscalation(payload: EscalationPayload): Promise<{ url?: string; id?: string }> {
  const githubToken = process.env.GITHUB_TOKEN;
  const jiraToken = process.env.JIRA_API_TOKEN;
  const jiraBaseUrl = process.env.JIRA_BASE_URL;

  if (githubToken) {
    return postGithubIssue(payload, githubToken);
  }

  if (jiraToken && jiraBaseUrl) {
    return postJiraTicket(payload, jiraToken, jiraBaseUrl);
  }

  // No integration configured — return note only
  logger.info("No escalation integration configured, returning note only");
  return {};
}

async function postGithubIssue(payload: EscalationPayload, token: string) {
  const repo = process.env.GITHUB_ESCALATION_REPO || "Trevorton27/support-buddy-demo-product";
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      title: `[${payload.priority}] ${payload.title}`,
      body: payload.body,
      labels: ["escalation", payload.severity, ...(payload.labels || [])],
    }),
  });

  if (!response.ok) {
    logger.error("Failed to create GitHub issue", { status: response.status });
    return {};
  }

  const issue = await response.json();
  return { url: issue.html_url as string, id: String(issue.number) };
}

async function postJiraTicket(payload: EscalationPayload, token: string, baseUrl: string) {
  const projectKey = process.env.JIRA_PROJECT_KEY || "SUP";
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: `[${payload.priority}] ${payload.title}`,
        description: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: payload.body }] }],
        },
        issuetype: { name: "Bug" },
        priority: { name: payload.priority },
      },
    }),
  });

  if (!response.ok) {
    logger.error("Failed to create Jira ticket", { status: response.status });
    return {};
  }

  const issue = await response.json();
  return { id: issue.id as string, url: `${baseUrl}/browse/${issue.key}` };
}
