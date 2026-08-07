import type OpenAI from "openai";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Cost per token in USD for each model
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o":      { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output:  0.60 / 1_000_000 },
};

export function extractTokenUsage(response: OpenAI.Chat.ChatCompletion): TokenUsage | null {
  if (!response.usage) return null;
  return {
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
  };
}

export function estimateCostUsd(usage: TokenUsage, model: string): number {
  const rates = MODEL_COSTS[model] ?? MODEL_COSTS["gpt-4o-mini"];
  return usage.promptTokens * rates.input + usage.completionTokens * rates.output;
}

export function formatCostUsd(costUsd: number): string {
  if (costUsd < 0.001) return `<$0.001`;
  return `$${costUsd.toFixed(4)}`;
}

