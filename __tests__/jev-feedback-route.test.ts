/**
 * POST /api/devin/tasks/[taskId]/jev-feedback — sends a JevOps review back to Devin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { devinTask: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireOrgAuth: vi.fn() }));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }));

const mockSendMessage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/integrations/devin", () => ({
  getDevinAdapter: () => ({ sendMessage: mockSendMessage }),
}));

import { prisma } from "@/lib/db";
import { requireOrgAuth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { POST } from "@/app/api/devin/tasks/[taskId]/jev-feedback/route";

const review = {
  decisionId: "dec-1",
  round: 0,
  jevDisposition: "retry",
  disposition: "retry",
  overrides: [],
  judgments: [{ question_key: "tests_credible", question_type: "noul", value: 0.2, confidence: null }],
  matchedRule: null,
  providerError: null,
  evaluatedAt: "2026-10-05T00:00:00.000Z",
};

function task(overrides?: Record<string, unknown>) {
  return {
    id: "task-1",
    orgId: "org-1",
    devinSessionId: "sess-1",
    status: "finished",
    jevopsReview: review,
    jevopsReviewRound: 0,
    ...overrides,
  };
}

function call(body: unknown = {}) {
  return POST(
    new Request("http://test/api/devin/tasks/task-1/jev-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ taskId: "task-1" }) }
  );
}

describe("POST /api/devin/tasks/[taskId]/jev-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgAuth).mockResolvedValue({ userId: "u1", orgId: "org-1", orgRole: "admin", response: null } as never);
  });

  it("sends the review to Devin, bumps the round and resumes polling", async () => {
    vi.mocked(prisma.devinTask.findUnique).mockResolvedValue(task() as never);
    vi.mocked(prisma.devinTask.update).mockResolvedValue({ jevopsReviewRound: 1 } as never);

    const res = await call({ note: "focus on the retry path" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, round: 1 });
    expect(mockSendMessage.mock.calls[0][0]).toBe("sess-1");
    expect(mockSendMessage.mock.calls[0][1]).toContain("Reviewer note: focus on the retry path");
    expect(vi.mocked(prisma.devinTask.update).mock.calls[0][0].data).toMatchObject({
      jevopsReviewRound: { increment: 1 },
      status: "working",
    });
    expect(inngest.send).toHaveBeenCalledWith({ name: "devin/task.resumed", data: { devinTaskId: "task-1" } });
  });

  it("refuses once the feedback limit is reached", async () => {
    vi.mocked(prisma.devinTask.findUnique).mockResolvedValue(task({ jevopsReviewRound: 2 }) as never);
    const res = await call();
    expect(res.status).toBe(409);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("refuses while Devin is still working", async () => {
    vi.mocked(prisma.devinTask.findUnique).mockResolvedValue(task({ status: "working" }) as never);
    expect((await call()).status).toBe(409);
  });

  it("requires a review and the caller's org", async () => {
    vi.mocked(prisma.devinTask.findUnique).mockResolvedValue(task({ jevopsReview: null }) as never);
    expect((await call()).status).toBe(400);

    vi.mocked(prisma.devinTask.findUnique).mockResolvedValue(task({ orgId: "other-org" }) as never);
    expect((await call()).status).toBe(403);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
