import { describe, it, expect } from "vitest";
import {
  extractTokenUsage,
  estimateCostUsd,
  formatCostUsd,
} from "@/lib/agent-utils";
import type OpenAI from "openai";

function makeChatCompletion(
  usage: OpenAI.CompletionUsage | undefined
): OpenAI.Chat.ChatCompletion {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1700000000,
    model: "gpt-4o",
    choices: [],
    usage,
  } as OpenAI.Chat.ChatCompletion;
}

describe("extractTokenUsage", () => {
  it("extracts usage from a completion with usage data", () => {
    const completion = makeChatCompletion({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
    const result = extractTokenUsage(completion);
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("returns null when usage is undefined", () => {
    const completion = makeChatCompletion(undefined);
    expect(extractTokenUsage(completion)).toBeNull();
  });
});

describe("estimateCostUsd", () => {
  it("calculates cost for gpt-4o", () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
    const cost = estimateCostUsd(usage, "gpt-4o");
    // input: $2.50/M, output: $10.00/M
    expect(cost).toBeCloseTo(12.5, 5);
  });

  it("calculates cost for gpt-4o-mini", () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
    const cost = estimateCostUsd(usage, "gpt-4o-mini");
    // input: $0.15/M, output: $0.60/M
    expect(cost).toBeCloseTo(0.75, 5);
  });

  it("falls back to gpt-4o-mini rates for unknown models", () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
    const known = estimateCostUsd(usage, "gpt-4o-mini");
    const unknown = estimateCostUsd(usage, "some-unknown-model");
    expect(unknown).toBeCloseTo(known, 10);
  });

  it("returns 0 cost for zero tokens", () => {
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    expect(estimateCostUsd(usage, "gpt-4o")).toBe(0);
  });

  it("handles prompt-only usage", () => {
    const usage = { promptTokens: 1000, completionTokens: 0, totalTokens: 1000 };
    const cost = estimateCostUsd(usage, "gpt-4o");
    expect(cost).toBeCloseTo(0.0025, 8); // 1000 * 2.50/1_000_000
  });
});

describe("formatCostUsd", () => {
  it("shows '<$0.001' for tiny costs", () => {
    expect(formatCostUsd(0)).toBe("<$0.001");
    expect(formatCostUsd(0.0005)).toBe("<$0.001");
    expect(formatCostUsd(0.0009)).toBe("<$0.001");
  });

  it("shows formatted dollar amount for costs >= $0.001", () => {
    expect(formatCostUsd(0.001)).toBe("$0.0010");
    expect(formatCostUsd(0.0025)).toBe("$0.0025");
    expect(formatCostUsd(1.5)).toBe("$1.5000");
    expect(formatCostUsd(12.5)).toBe("$12.5000");
  });
});
