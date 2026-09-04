import { getEnv } from "@/lib/env";
import type { IIntegrationAdapter, IntegrationTestResult, SlackMessage } from "../types";

export class SlackClient implements IIntegrationAdapter {
  readonly name = "Slack";
  readonly type = "slack";
  readonly isLive = true;

  private get webhookUrl() {
    return getEnv().SLACK_WEBHOOK_URL!;
  }

  async testConnection(): Promise<IntegrationTestResult> {
    const start = Date.now();
    try {
      const result = await this.send({ text: "The Support Buddy X9000: connection test ✓" });
      return { ok: result, message: result ? "Webhook delivered" : "Webhook failed", latencyMs: Date.now() - start };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Send failed" };
    }
  }

  async send(message: SlackMessage): Promise<boolean> {
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    return response.ok;
  }

  async postApprovalSummary(runId: string, action: string, ticketTitle: string): Promise<void> {
    await this.send({
      text: `*The Support Buddy X9000 — Investigation ${action}*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${action === "approved" ? "✅" : "❌"} Investigation ${action}*\nTicket: ${ticketTitle}\nRun ID: \`${runId.slice(0, 8)}\``,
          },
        },
      ],
    });
  }
}
