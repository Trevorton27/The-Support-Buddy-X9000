import { describe, it, expect, vi } from "vitest";

// Mock dependencies before importing
vi.mock("@/lib/db", () => ({
  prisma: {
    workSignal: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    workItem: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "wi-1" }),
    },
    workItemEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      workItem: {
        create: vi.fn().mockResolvedValue({ id: "wi-1", type: "CUSTOMER_REPLY", status: "OPEN", priorityScore: 50, priorityBand: "MEDIUM" }),
      },
      workItemEvent: {
        create: vi.fn(),
      },
    })),
  },
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ OPENAI_API_KEY: "test-key" }),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                type: "CUSTOMER_REPLY",
                title: "Reply to customer inquiry",
                summary: "Customer needs help with login",
                confidence: 0.85,
              }),
            },
          }],
        }),
      },
    };
  }
  return { default: MockOpenAI };
});

vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue("mock prompt"),
}));

import { extractAction } from "@/lib/signal-processor";

describe("Signal Processor", () => {
  describe("extractAction", () => {
    it("extracts action from signal", async () => {
      const result = await extractAction({
        eventType: "email.received",
        payload: { subject: "Help with login", body: "I can't log in" },
        sourceSystem: "email",
      });

      expect(result.type).toBe("CUSTOMER_REPLY");
      expect(result.title).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("returns confidence value", async () => {
      const result = await extractAction({
        eventType: "email.received",
        payload: { subject: "Test" },
        sourceSystem: "test",
      });

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
