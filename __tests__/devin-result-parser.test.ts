import { describe, it, expect } from "vitest";
import { parseDevinResult } from "@/lib/integrations/devin/result-parser";
import type { DevinSession } from "@/lib/integrations/devin/types";

function makeSession(overrides?: Partial<DevinSession>): DevinSession {
  return {
    session_id: "test-session",
    status_enum: "finished",
    title: "Test",
    messages: [],
    tags: [],
    created_at: "2024-01-16T10:00:00Z",
    updated_at: "2024-01-16T11:00:00Z",
    ...overrides,
  };
}

describe("parseDevinResult", () => {
  it("parses finished fix session with PR → FIX_SUBMITTED", () => {
    const session = makeSession({
      structured_output: {
        verdict: "FIX_SUBMITTED",
        verdictReason: "Fix applied",
        changedFiles: ["lib/auth.ts"],
        branch: "fix/jwt-ttl",
        testResults: "All pass",
      },
      pull_request: { url: "https://github.com/org/repo/pull/42" },
    });
    const result = parseDevinResult(session, "fix");
    expect(result.verdict).toBe("FIX_SUBMITTED");
    expect(result.pullRequestUrl).toBe("https://github.com/org/repo/pull/42");
    expect(result.changedFiles).toContain("lib/auth.ts");
  });

  it("parses finished reproduce session with structured_output → REPRODUCED", () => {
    const session = makeSession({
      structured_output: {
        verdict: "REPRODUCED",
        verdictReason: "Bug confirmed in local env",
        reproductionSteps: ["Step 1", "Step 2"],
      },
    });
    const result = parseDevinResult(session, "reproduce");
    expect(result.verdict).toBe("REPRODUCED");
    expect(result.reproductionSteps).toEqual(["Step 1", "Step 2"]);
  });

  it("handles expired session", () => {
    const session = makeSession({ status_enum: "expired" });
    const result = parseDevinResult(session, "reproduce");
    expect(result.verdict).toBe("ADDITIONAL_INFORMATION_REQUIRED");
    expect(result.verdictReason).toContain("expired");
  });

  it("falls back to message scanning when no structured_output", () => {
    const session = makeSession({
      structured_output: undefined,
      messages: [
        { role: "devin", content: "I was able to REPRODUCED the issue by..." },
      ],
    });
    const result = parseDevinResult(session, "reproduce");
    expect(result.verdict).toBe("REPRODUCED");
  });

  it("rejects invalid PR URL", () => {
    const session = makeSession({
      structured_output: { verdict: "FIX_SUBMITTED", verdictReason: "done" },
      pull_request: { url: "not-a-url" },
    });
    const result = parseDevinResult(session, "fix");
    expect(result.verdict).toBe("FIX_SUBMITTED");
    expect(result.pullRequestUrl).toBeUndefined();
  });

  it("returns ADDITIONAL_INFORMATION_REQUIRED for malformed output", () => {
    const session = makeSession({
      structured_output: { wrongField: true } as unknown as Record<string, unknown>,
      messages: [],
    });
    const result = parseDevinResult(session, "reproduce");
    expect(result.verdict).toBe("ADDITIONAL_INFORMATION_REQUIRED");
  });
});
