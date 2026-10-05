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

export async function evaluateAction(params: EvaluateParams): Promise<JevOpsDecision | null> {
  const apiUrl = process.env.JEVOPS_API_URL;
  const apiKey = process.env.JEVOPS_API_KEY;

  if (!apiUrl || !apiKey || !isJevOpsEnabled()) {
    logger.info("JevOps not configured, skipping evaluation");
    return null;
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
      logger.error("JevOps evaluation failed", {
        status: response.status,
        body: await response.text(),
      });
      return null;
    }

    return (await response.json()) as JevOpsDecision;
  } catch (error) {
    logger.error("JevOps evaluation error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getDecision(decisionId: string): Promise<JevOpsDecision | null> {
  const apiUrl = process.env.JEVOPS_API_URL;
  const apiKey = process.env.JEVOPS_API_KEY;

  if (!apiUrl || !apiKey) return null;

  try {
    const response = await fetch(`${apiUrl}/v1/decisions/${decisionId}`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      logger.error("JevOps decision fetch failed", { status: response.status, decisionId });
      return null;
    }

    return (await response.json()) as JevOpsDecision;
  } catch (error) {
    logger.error("JevOps decision fetch error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
