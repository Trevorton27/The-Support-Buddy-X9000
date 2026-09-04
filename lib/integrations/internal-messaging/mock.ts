import type { IIntegrationAdapter, IntegrationTestResult } from "../types";

const MOCK_MESSAGES = [
  { from: "eng-oncall", channel: "#incidents", message: "FYI: deploy v2.3.2 rolled back due to memory leak in auth service", type: "incident_update" },
  { from: "product-manager", channel: "#support-escalations", message: "Customer Acme Corp needs update on their enterprise migration by EOD", type: "escalation" },
  { from: "qa-team", channel: "#bugs", message: "Confirmed: webhook retry logic has a race condition in high-throughput scenarios", type: "bug_report" },
  { from: "devops", channel: "#infra", message: "Scheduled maintenance window: eu-west-1 DB failover tonight 2am UTC", type: "scheduled" },
  { from: "support-lead", channel: "#support-team", message: "Please prioritize tickets from BigCorp — they're in renewal negotiations", type: "priority_change" },
];

export class MockInternalMessagingAdapter implements IIntegrationAdapter {
  readonly name = "Internal Messaging";
  readonly type = "internal-messaging";
  readonly isLive = false;

  async testConnection(): Promise<IntegrationTestResult> {
    return { ok: true, message: "Mock internal messaging adapter active" };
  }

  receiveMessage(): { eventType: string; payload: Record<string, unknown>; evidence: string } {
    const msg = MOCK_MESSAGES[Math.floor(Math.random() * MOCK_MESSAGES.length)];
    return {
      eventType: "internal.message",
      payload: {
        from: msg.from,
        channel: msg.channel,
        message: msg.message,
        messageType: msg.type,
        receivedAt: new Date().toISOString(),
      },
      evidence: `${msg.channel} from ${msg.from}: "${msg.message}"`,
    };
  }
}
