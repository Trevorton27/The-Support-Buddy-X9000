import { describe, it, expect } from "vitest";
import { devinStructuredResultSchema, mapDevinStatusToInternal } from "@/lib/integrations/devin/types";
import type { DevinSession } from "@/lib/integrations/devin/types";

function baseSession(overrides?: Partial<DevinSession>): DevinSession {
  return {
    session_id: "s1",
    status_enum: "working",
    messages: [],
    tags: [],
    created_at: "2024-01-16T10:00:00Z",
    updated_at: "2024-01-16T11:00:00Z",
    ...overrides,
  };
}

describe("devinStructuredResultSchema", () => {
  it("validates correct input", () => {
    const result = devinStructuredResultSchema.safeParse({
      verdict: "REPRODUCED",
      verdictReason: "Bug confirmed",
      reproductionSteps: ["Step 1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing verdict", () => {
    const result = devinStructuredResultSchema.safeParse({
      verdictReason: "no verdict field",
    });
    expect(result.success).toBe(false);
  });

  it("accepts minimal valid input (verdict only)", () => {
    const result = devinStructuredResultSchema.safeParse({ verdict: "FIX_SUBMITTED" });
    expect(result.success).toBe(true);
  });
});

describe("mapDevinStatusToInternal", () => {
  it("maps working → working", () => {
    expect(mapDevinStatusToInternal("working", baseSession())).toBe("working");
  });

  it("maps finished → finished", () => {
    expect(mapDevinStatusToInternal("finished", baseSession({ status_enum: "finished" }))).toBe("finished");
  });

  it("maps expired → expired", () => {
    expect(mapDevinStatusToInternal("expired", baseSession({ status_enum: "expired" }))).toBe("expired");
  });

  it("maps blocked → blocked", () => {
    expect(mapDevinStatusToInternal("blocked", baseSession({ status_enum: "blocked" }))).toBe("blocked");
  });

  it("maps resumed → working", () => {
    expect(mapDevinStatusToInternal("resumed", baseSession({ status_enum: "resumed" }))).toBe("working");
  });

  it("maps suspend_requested → waiting", () => {
    expect(mapDevinStatusToInternal("suspend_requested", baseSession({ status_enum: "suspend_requested" }))).toBe("waiting");
  });

  it("maps working with PR → pr_ready", () => {
    const session = baseSession({ pull_request: { url: "https://github.com/org/repo/pull/1" } });
    expect(mapDevinStatusToInternal("working", session)).toBe("pr_ready");
  });

  it("handles unknown status gracefully", () => {
    expect(mapDevinStatusToInternal("unknown_future_status", baseSession({ status_enum: "unknown_future_status" }))).toBe("working");
  });
});
