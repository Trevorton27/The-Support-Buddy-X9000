import { describe, it, expect } from "vitest";
import { MockDevinAdapter } from "@/lib/integrations/devin/mock";

describe("MockDevinAdapter", () => {
  it("createSession returns valid shape", async () => {
    const adapter = new MockDevinAdapter();
    const result = await adapter.createSession({ prompt: "test prompt" });
    expect(result.session_id).toMatch(/^mock-devin-/);
    expect(result.url).toContain("app.devin.ai/sessions/");
  });

  it("getSession cycles: working → working → finished", async () => {
    const adapter = new MockDevinAdapter();
    const { session_id } = await adapter.createSession({ prompt: "test" });

    const s1 = await adapter.getSession(session_id);
    expect(s1.status_enum).toBe("working");

    const s2 = await adapter.getSession(session_id);
    expect(s2.status_enum).toBe("working");

    const s3 = await adapter.getSession(session_id);
    expect(s3.status_enum).toBe("finished");
    expect(s3.structured_output).toBeDefined();
  });

  it("testConnection returns ok: true, isLive: false", async () => {
    const adapter = new MockDevinAdapter();
    const result = await adapter.testConnection();
    expect(result.ok).toBe(true);
    expect(adapter.isLive).toBe(false);
  });

  it("sendMessage does not throw", async () => {
    const adapter = new MockDevinAdapter();
    const { session_id } = await adapter.createSession({ prompt: "test" });
    await expect(adapter.sendMessage(session_id, "hello")).resolves.not.toThrow();
  });
});
