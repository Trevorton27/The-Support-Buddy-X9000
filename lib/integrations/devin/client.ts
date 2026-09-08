import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type {
  IDevinAdapter,
  DevinCreateSessionRequest,
  DevinCreateSessionResponse,
  DevinSession,
} from "./types";
import type { IntegrationTestResult } from "../types";

const logger = createLogger("devin-client");
const BASE_URL = "https://api.devin.ai/v1";

export class DevinClient implements IDevinAdapter {
  readonly name = "Devin";
  readonly type = "devin";
  readonly isLive = true;

  private get apiKey() {
    return getEnv().DEVIN_API_KEY!;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<IntegrationTestResult> {
    const start = Date.now();
    try {
      const response = await fetch(`${BASE_URL}/sessions?limit=1`, {
        headers: this.headers,
        signal: AbortSignal.timeout(30000),
      });
      return {
        ok: response.ok,
        message: response.ok ? "Connected to Devin API" : `HTTP ${response.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  async createSession(req: DevinCreateSessionRequest): Promise<DevinCreateSessionResponse> {
    logger.info("Creating Devin session", { promptLength: req.prompt.length });

    const response = await fetch(`${BASE_URL}/sessions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ prompt: req.prompt }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error("Failed to create Devin session", { status: response.status, body: text });
      throw new Error(`Devin API error: ${response.status} — ${text}`);
    }

    const data = (await response.json()) as { session_id: string; url?: string };
    return {
      session_id: data.session_id,
      url: data.url ?? `https://app.devin.ai/sessions/${data.session_id}`,
    };
  }

  async getSession(sessionId: string): Promise<DevinSession> {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Devin API error: ${response.status}`);
    }

    return (await response.json()) as DevinSession;
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    logger.info("Sending message to Devin session", { sessionId, messageLength: message.length });

    const response = await fetch(`${BASE_URL}/sessions/${sessionId}/message`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error("Failed to send message to Devin", { sessionId, status: response.status });
      throw new Error(`Devin API error: ${response.status} — ${text}`);
    }
  }
}
