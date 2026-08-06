import { SentryClient } from "./client";
import { getMockSentryIssues } from "./mock";
import type { SentryIssue, IIntegrationAdapter, IntegrationTestResult } from "../types";

class MockSentryAdapter implements IIntegrationAdapter {
  readonly name = "Sentry";
  readonly type = "sentry";
  readonly isLive = false;

  async testConnection(): Promise<IntegrationTestResult> {
    return { ok: true, message: "Mock mode — no live connection", latencyMs: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getIssues(_orgSlug: string, _projectSlug: string): SentryIssue[] {
    return getMockSentryIssues();
  }
}

export function getSentryAdapter(): (IIntegrationAdapter & { getIssues(org: string, project: string): SentryIssue[] | Promise<SentryIssue[]> }) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (token) return new SentryClient();
  return new MockSentryAdapter();
}

export { getMockSentryIssues };
