import { createLogger } from "@/lib/logger";

const logger = createLogger("jevops-client");

export interface JevOpsDecision {
  id: string;
  disposition: "allow" | "retry" | "human_review" | "block";
  final_disposition: string | null;
  action_type: string;
  judgments: Array<{
    question_key: string;
    question_type: string;
    value: number | string;
    probabilities: Record<string, number> | null;
    confidence: number | null;
  }>;
  policy_trace: Record<string, unknown>;
  provider_latency_ms: number | null;
  provider_model?: string | null;
  mode?: string;
  environment?: string;
  correlation_id: string | null;
  created_at?: string | null;
}

export function isJevOpsEnabled(): boolean {
  return (
    !!process.env.JEVOPS_API_URL &&
    !!process.env.JEVOPS_API_KEY &&
    process.env.JEVOPS_ENABLED === "true"
  );
}

export interface JevOpsQuestion {
  type: "noul" | "choice" | "score";
  instructions: string;
  criteria?: Record<string, string> | string[];
}

export interface EvaluateParams {
  agentId: string;
  actionType: string;
  action: Record<string, unknown>;
  objective?: string;
  state?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  questions?: Record<string, JevOpsQuestion>; // omit to use JevOps's default questions
  correlationId?: string;
  idempotencyKey?: string;
}

/** Why a JevOps call didn't produce a decision. `code` is the HTTP status, or a name for non-HTTP failures. */
export interface JevOpsError {
  code: string; // e.g. "500", "401", "TIMEOUT", "NETWORK_ERROR", "NOT_CONFIGURED"
  message: string;
}

export type JevOpsResult<T> = { ok: true; data: T } | { ok: false; error: JevOpsError };

async function httpError(response: Response): Promise<JevOpsError> {
  const body = (await response.text().catch(() => "")).trim();
  let message = body;
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (detail !== undefined) message = typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    /* not JSON — keep the raw body */
  }
  return { code: String(response.status), message: (message || response.statusText).slice(0, 500) };
}

function thrownError(error: unknown): JevOpsError {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "TimeoutError" || name === "AbortError") return { code: "TIMEOUT", message };
  return { code: "NETWORK_ERROR", message };
}

export async function evaluateActionResult(params: EvaluateParams): Promise<JevOpsResult<JevOpsDecision>> {
  const apiUrl = process.env.JEVOPS_API_URL;
  const apiKey = process.env.JEVOPS_API_KEY;

  if (!apiUrl || !apiKey || !isJevOpsEnabled()) {
    logger.info("JevOps not configured, skipping evaluation");
    return {
      ok: false,
      error: { code: "NOT_CONFIGURED", message: "Set JEVOPS_API_URL, JEVOPS_API_KEY and JEVOPS_ENABLED=true" },
    };
  }

  try {
    const response = await fetch(`${apiUrl}/v1/decisions/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(params.correlationId ? { "X-Correlation-ID": params.correlationId } : {}),
      },
      body: JSON.stringify({
        agent_id: params.agentId,
        action_type: params.actionType,
        action: params.action,
        objective: params.objective,
        state: params.state || {},
        evidence: params.evidence || {},
        questions: params.questions,
        idempotency_key: params.idempotencyKey,
        environment: process.env.NODE_ENV === "production" ? "live" : "test",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const error = await httpError(response);
      logger.error("JevOps evaluation failed", { status: response.status, body: error.message });
      return { ok: false, error };
    }

    return { ok: true, data: (await response.json()) as JevOpsDecision };
  } catch (err) {
    const error = thrownError(err);
    logger.error("JevOps evaluation error", { code: error.code, error: error.message });
    return { ok: false, error };
  }
}

export async function evaluateAction(params: EvaluateParams): Promise<JevOpsDecision | null> {
  const result = await evaluateActionResult(params);
  return result.ok ? result.data : null;
}

export async function getDecisionResult(decisionId: string): Promise<JevOpsResult<JevOpsDecision>> {
  const apiUrl = process.env.JEVOPS_API_URL;
  const apiKey = process.env.JEVOPS_API_KEY;

  if (!apiUrl || !apiKey) {
    return { ok: false, error: { code: "NOT_CONFIGURED", message: "Set JEVOPS_API_URL and JEVOPS_API_KEY" } };
  }

  try {
    const response = await fetch(`${apiUrl}/v1/decisions/${decisionId}`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      const error = await httpError(response);
      logger.error("JevOps decision fetch failed", { status: response.status, decisionId });
      return { ok: false, error };
    }

    return { ok: true, data: (await response.json()) as JevOpsDecision };
  } catch (err) {
    const error = thrownError(err);
    logger.error("JevOps decision fetch error", { code: error.code, error: error.message });
    return { ok: false, error };
  }
}

export async function getDecision(decisionId: string): Promise<JevOpsDecision | null> {
  const result = await getDecisionResult(decisionId);
  return result.ok ? result.data : null;
}

export async function recordOutcome(
  decisionId: string,
  groundTruthLabel: string,
  outcomeData: Record<string, unknown> = {}
): Promise<void> {
  const apiUrl = process.env.JEVOPS_API_URL;
  const apiKey = process.env.JEVOPS_API_KEY;

  if (!apiUrl || !apiKey) return;

  try {
    await fetch(`${apiUrl}/v1/decisions/${decisionId}/outcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        ground_truth_label: groundTruthLabel,
        outcome_data: outcomeData,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    logger.error("JevOps outcome recording failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
