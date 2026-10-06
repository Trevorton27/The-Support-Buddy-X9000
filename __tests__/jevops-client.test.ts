import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateActionResult, getDecisionResult } from "@/lib/integrations/jevops/client";

const params = { agentId: "agent-1", actionType: "send_customer_reply", action: {} };

describe("JevOps client error codes", () => {
  beforeEach(() => {
    vi.stubEnv("JEVOPS_API_URL", "https://jevops.test");
    vi.stubEnv("JEVOPS_API_KEY", "jvo_test_abcd1234_secret");
    vi.stubEnv("JEVOPS_ENABLED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns the decision on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "dec-1" }), { status: 200 })));
    expect(await evaluateActionResult(params)).toEqual({ ok: true, data: { id: "dec-1" } });
  });

  it("uses the HTTP status as the code and FastAPI's detail as the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Invalid API key" }), { status: 401 })));
    expect(await evaluateActionResult(params)).toEqual({ ok: false, error: { code: "401", message: "Invalid API key" } });
  });

  it("keeps a plain-text error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 })));
    expect(await evaluateActionResult(params)).toEqual({ ok: false, error: { code: "500", message: "Internal Server Error" } });
  });

  it("maps timeouts and network failures", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    expect(await evaluateActionResult(params)).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await getDecisionResult("dec-1")).toEqual({ ok: false, error: { code: "NETWORK_ERROR", message: "fetch failed" } });
  });

  it("reports NOT_CONFIGURED without calling the API", async () => {
    vi.stubEnv("JEVOPS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await evaluateActionResult(params);
    expect(result.ok === false && result.error.code).toBe("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
