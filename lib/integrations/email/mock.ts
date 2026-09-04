import type { IIntegrationAdapter, IntegrationTestResult } from "../types";

const MOCK_EMAILS = [
  { subject: "Re: Cannot access dashboard", from: "alice@acmecorp.com", body: "I'm still unable to log in after resetting my password. This is urgent for our team.", sentiment: "frustrated" },
  { subject: "Question about API rate limits", from: "bob@techstartup.io", body: "We're seeing 429 errors during peak hours. What's our current rate limit?", sentiment: "neutral" },
  { subject: "Billing discrepancy on last invoice", from: "carol@enterprise.com", body: "There's a charge we don't recognize on our latest invoice. Can you clarify?", sentiment: "neutral" },
  { subject: "Feature request: Bulk export", from: "dave@smallbiz.co", body: "Would it be possible to add a bulk data export feature? We need this for compliance.", sentiment: "positive" },
  { subject: "URGENT: Data not syncing", from: "eve@bigclient.com", body: "Our data sync has been broken for 2 hours. This is affecting production!", sentiment: "frustrated" },
];

export class MockEmailAdapter implements IIntegrationAdapter {
  readonly name = "Email";
  readonly type = "email";
  readonly isLive = false;

  async testConnection(): Promise<IntegrationTestResult> {
    return { ok: true, message: "Mock email adapter active" };
  }

  receiveEmail(): { eventType: string; payload: Record<string, unknown>; evidence: string } {
    const email = MOCK_EMAILS[Math.floor(Math.random() * MOCK_EMAILS.length)];
    return {
      eventType: "email.received",
      payload: {
        subject: email.subject,
        from: email.from,
        body: email.body,
        sentiment: email.sentiment,
        receivedAt: new Date().toISOString(),
      },
      evidence: `Email from ${email.from}: "${email.subject}"`,
    };
  }
}
