import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    workItem: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
    workItemEvent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentWorkContext: {
      upsert: vi.fn().mockResolvedValue({ id: "ctx-1" }),
    },
  },
}));

vi.mock("@/lib/guardrails-rules", () => ({
  runDeterministicChecks: vi.fn().mockReturnValue([]),
}));

import { buildWorkContext } from "@/lib/work-context";

describe("Work Context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns context for given agent and org", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "wi-1",
        type: "CUSTOMER_REPLY",
        title: "Reply to customer",
        status: "OPEN",
        priorityScore: 75,
        priorityBand: "HIGH",
        ticketId: "t-1",
        dueAt: null,
        waitingOn: null,
        snoozedUntil: null,
      },
    ]);
    mockGroupBy.mockResolvedValue([
      { status: "OPEN", _count: 3 },
      { status: "IN_PROGRESS", _count: 1 },
    ]);

    const result = await buildWorkContext("agent-1", "org-1");

    expect(result.agentId).toBe("agent-1");
    expect(result.orgId).toBe("org-1");
    expect(result.activeCounts.open).toBe(3);
    expect(result.activeCounts.inProgress).toBe(1);
    expect(result.topPriorities.length).toBe(1);
    expect(result.topPriorities[0].title).toBe("Reply to customer");
  });

  it("limits top priorities to 5", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `wi-${i}`,
      type: "CUSTOMER_REPLY",
      title: `Item ${i}`,
      status: "OPEN",
      priorityScore: 90 - i * 5,
      priorityBand: "HIGH",
      ticketId: null,
      dueAt: null,
      waitingOn: null,
      snoozedUntil: null,
    }));
    mockFindMany.mockResolvedValue(items);
    mockGroupBy.mockResolvedValue([]);

    const result = await buildWorkContext("agent-1", "org-1");

    expect(result.topPriorities.length).toBe(5);
  });

  it("handles empty workload", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([]);

    const result = await buildWorkContext("agent-1", "org-1");

    expect(result.activeCounts.open).toBe(0);
    expect(result.topPriorities.length).toBe(0);
    expect(result.sourceWorkItemIds.length).toBe(0);
  });

  it("identifies risks for items due soon", async () => {
    const soon = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
    mockFindMany.mockResolvedValue([
      {
        id: "wi-due",
        type: "CUSTOMER_REPLY",
        title: "Urgent reply",
        status: "OPEN",
        priorityScore: 80,
        priorityBand: "URGENT",
        ticketId: null,
        dueAt: soon,
        waitingOn: null,
        snoozedUntil: null,
      },
    ]);
    mockGroupBy.mockResolvedValue([]);

    const result = await buildWorkContext("agent-1", "org-1");

    expect(result.risks.length).toBe(1);
    expect(result.risks[0].reason).toContain("30 minutes");
  });
});
