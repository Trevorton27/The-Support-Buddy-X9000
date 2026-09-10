/**
 * GitHub Issue Sync — creates GitHub issues on the demo product repo
 * when support tickets are created, so Devin can work on them.
 *
 * Auth: GitHub App (preferred) or Personal Access Token (fallback).
 *
 * GitHub App env vars:
 *   GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID
 *
 * PAT fallback:
 *   GITHUB_TOKEN
 */

import { createSign } from "crypto";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const logger = createLogger("github-sync");

const GITHUB_API = "https://api.github.com";
const DEFAULT_REPO = "Trevorton27/support-buddy-demo-product";

function getRepo(): string {
  return process.env.GITHUB_ESCALATION_REPO || DEFAULT_REPO;
}

// ─── GitHub App JWT ───

let _cachedInstallationToken: { token: string; expiresAt: number } | null = null;

function createGitHubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60, // 60s clock skew allowance
      exp: now + 600, // 10 min max
      iss: appId,
    })
  ).toString("base64url");

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(privateKey, "base64url");

  return `${header}.${payload}.${signature}`;
}

async function getInstallationToken(): Promise<string | null> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    return null;
  }

  // Return cached token if still valid (5 min buffer)
  if (_cachedInstallationToken && _cachedInstallationToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return _cachedInstallationToken.token;
  }

  // The private key may have literal \n from env vars — normalize
  const normalizedKey = privateKey.replace(/\\n/g, "\n");

  const jwt = createGitHubAppJwt(appId, normalizedKey);

  const res = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("Failed to get GitHub App installation token", { status: res.status, body: text });
    return null;
  }

  const data = await res.json();
  _cachedInstallationToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return data.token;
}

// ─── Auth Resolution ───

async function getAuthToken(): Promise<string | null> {
  // Prefer GitHub App
  const appToken = await getInstallationToken();
  if (appToken) return appToken;

  // Fallback to PAT
  return process.env.GITHUB_TOKEN || null;
}

// ─── Issue Body Builder ───

const SEVERITY_LABELS: Record<string, string> = {
  critical: "severity: critical",
  high: "severity: high",
  medium: "severity: medium",
  low: "severity: low",
};

function buildIssueBody(
  ticket: {
    id: string;
    title: string;
    description: string;
    severity: string;
    category: string | null;
    product: string | null;
  },
  scenario?: {
    service: string;
    reproductionSteps: string[];
    affectedPaths: string[];
    acceptanceCriteria: string[];
    defectPatch?: { filePath: string } | null;
  } | null
): string {
  const sections: string[] = [];

  sections.push(`## Bug Report\n\n${ticket.description}`);

  sections.push(`### Metadata\n
| Field | Value |
|-------|-------|
| Ticket ID | \`${ticket.id}\` |
| Severity | **${ticket.severity}** |
| Category | ${ticket.category || "---"} |
| Product/Service | ${ticket.product || "---"} |`);

  if (scenario) {
    if (scenario.service) {
      sections.push(`### Affected Service\n\n\`${scenario.service}\``);
    }

    if (scenario.affectedPaths.length > 0) {
      sections.push(
        `### Affected Files\n\n${scenario.affectedPaths.map((p) => `- \`${p}\``).join("\n")}`
      );
    }

    if (scenario.reproductionSteps.length > 0) {
      sections.push(
        `### Reproduction Steps\n\n${scenario.reproductionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      );
    }

    if (scenario.acceptanceCriteria.length > 0) {
      sections.push(
        `### Acceptance Criteria\n\n${scenario.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}`
      );
    }

    if (scenario.defectPatch?.filePath) {
      sections.push(
        `### Known Defect Location\n\nThe defect is in \`${scenario.defectPatch.filePath}\`. Investigate this file for the root cause.`
      );
    }
  }

  sections.push(`---\n*Auto-created by The Support Buddy X9000*`);

  return sections.join("\n\n");
}

// ─── Sync Function ───

/**
 * Create a GitHub issue for a ticket and update the ticket with the issue URL.
 * Gracefully no-ops if neither GitHub App nor GITHUB_TOKEN is configured.
 */
export async function syncTicketToGitHub(
  ticketId: string
): Promise<{ issueUrl: string; issueNumber: number } | null> {
  const token = await getAuthToken();
  if (!token) {
    logger.info("No GitHub auth configured, skipping sync", { ticketId });
    return null;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { customer: true },
  });

  if (!ticket) {
    logger.error("Ticket not found for GitHub sync", { ticketId });
    return null;
  }

  // Skip if already synced
  if (ticket.githubIssueUrl) {
    logger.info("Ticket already synced to GitHub", { ticketId, url: ticket.githubIssueUrl });
    return { issueUrl: ticket.githubIssueUrl, issueNumber: ticket.githubIssueNumber! };
  }

  // Look for linked scenario data to enrich the issue
  let scenarioData: {
    service: string;
    reproductionSteps: string[];
    affectedPaths: string[];
    acceptanceCriteria: string[];
    defectPatch?: { filePath: string } | null;
  } | null = null;

  const scenario = await prisma.demoIssueScenario.findFirst({
    where: { activeTicketId: ticketId },
  });

  if (scenario) {
    scenarioData = {
      service: scenario.service,
      reproductionSteps: (scenario.reproductionSteps as string[]) || [],
      affectedPaths: (scenario.affectedPaths as string[]) || [],
      acceptanceCriteria: (scenario.acceptanceCriteria as string[]) || [],
      defectPatch: scenario.defectPatch as { filePath: string } | null,
    };
  }

  const repo = getRepo();
  const labels = ["support-ticket"];
  if (SEVERITY_LABELS[ticket.severity]) {
    labels.push(SEVERITY_LABELS[ticket.severity]);
  }
  if (ticket.category) {
    labels.push(ticket.category);
  }
  if (ticket.product) {
    labels.push(ticket.product);
  }

  const body = buildIssueBody(
    {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      severity: ticket.severity,
      category: ticket.category,
      product: ticket.product,
    },
    scenarioData
  );

  try {
    const response = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        title: `[${ticket.severity.toUpperCase()}] ${ticket.title}`,
        body,
        labels,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("Failed to create GitHub issue", {
        status: response.status,
        body: text,
        ticketId,
      });
      return null;
    }

    const issue = await response.json();
    const issueUrl = issue.html_url as string;
    const issueNumber = issue.number as number;

    // Update ticket with GitHub issue reference
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { githubIssueUrl: issueUrl, githubIssueNumber: issueNumber },
    });

    logger.info("Ticket synced to GitHub", { ticketId, issueUrl, issueNumber });
    return { issueUrl, issueNumber };
  } catch (err) {
    logger.error("GitHub sync error", { ticketId, error: String(err) });
    return null;
  }
}
