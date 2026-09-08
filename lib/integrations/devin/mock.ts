import { createLogger } from "@/lib/logger";
import type {
  IDevinAdapter,
  DevinCreateSessionRequest,
  DevinCreateSessionResponse,
  DevinSession,
} from "./types";
import type { IntegrationTestResult } from "../types";

const logger = createLogger("devin-mock");

let mockCounter = 0;

// Track poll counts per session for state cycling
const sessionPollCounts = new Map<string, number>();

export class MockDevinAdapter implements IDevinAdapter {
  readonly name = "Devin";
  readonly type = "devin";
  readonly isLive = false;

  async testConnection(): Promise<IntegrationTestResult> {
    return { ok: true, message: "Mock mode — no live Devin connection", latencyMs: 0 };
  }

  async createSession(req: DevinCreateSessionRequest): Promise<DevinCreateSessionResponse> {
    mockCounter++;
    const sessionId = `mock-devin-${mockCounter}`;
    sessionPollCounts.set(sessionId, 0);
    logger.info("[MOCK DEVIN] Session created", { sessionId, promptLength: req.prompt.length });
    return {
      session_id: sessionId,
      url: `https://app.devin.ai/sessions/${sessionId}`,
    };
  }

  async getSession(sessionId: string): Promise<DevinSession> {
    const count = (sessionPollCounts.get(sessionId) ?? 0) + 1;
    sessionPollCounts.set(sessionId, count);

    const isFixMode = sessionId.includes("fix");
    const base: DevinSession = {
      session_id: sessionId,
      status_enum: "working",
      title: "Mock Devin session",
      messages: [
        { role: "user", content: "Investigating issue..." },
        { role: "devin", content: "I'm working on reproducing the issue." },
      ],
      tags: ["mock"],
      created_at: new Date(Date.now() - 300000).toISOString(),
      updated_at: new Date().toISOString(),
    };

    // State cycling: working → working → finished
    if (count >= 3) {
      base.status_enum = "finished";
      base.structured_output = {
        verdict: isFixMode ? "FIX_SUBMITTED" : "REPRODUCED",
        verdictReason: isFixMode
          ? "Successfully implemented fix and opened PR"
          : "Bug reproduced successfully in local environment",
        reproductionSteps: [
          "1. Set up local environment",
          "2. Ran test suite",
          "3. Triggered the reported error path",
        ],
        confirmedHypotheses: ["Database connection timeout under load"],
        rejectedHypotheses: [],
        changedFiles: isFixMode ? ["lib/db.ts", "lib/connection-pool.ts"] : [],
        testResults: "All tests passing",
      };
      if (isFixMode) {
        base.pull_request = { url: "https://github.com/mock-org/mock-repo/pull/42" };
      }
      base.messages.push({
        role: "devin",
        content: isFixMode
          ? "Fix implemented and PR opened."
          : "I've successfully reproduced the issue.",
      });
    }

    logger.info("[MOCK DEVIN] getSession", { sessionId, pollCount: count, status: base.status_enum });
    return base;
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    logger.info("[MOCK DEVIN] Message sent", { sessionId, messageLength: message.length });
  }
}
