import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    generationBatch: {
      findUnique: vi.fn(),
    },
    generatedTicketMeta: {
      findMany: vi.fn(),
    },
  },
}));

import { exportBatchAsCsv, exportBatchAsJson, exportBatchAsMarkdown } from "@/lib/generation/dataset-exporter";
import { prisma } from "@/lib/db";

const mockFindUnique = prisma.generationBatch.findUnique as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.generatedTicketMeta.findMany as ReturnType<typeof vi.fn>;

function makeMockBatch(id = "batch-1") {
  return { id, name: "Test Batch", mode: "wizard", status: "complete" };
}

function makeMockMeta(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "meta-1",
    ticketId: "ticket-1",
    batchId: "batch-1",
    trueRootCause: "Memory leak in auth service",
    trueCategory: "performance",
    trueSeverity: "high",
    affectedProduct: "Auth Service",
    injectedFaults: ["misleading log", "red herring metric"],
    difficulty: "medium",
    scenario: null,
    scenarioRole: null,
    scoreCache: null,
    createdAt: new Date("2024-01-01T10:00:00Z"),
    ticket: {
      id: "ticket-1",
      title: "Login is slow",
      description: "Users report slow login times",
      category: "performance",
      product: "Auth Service",
      severity: "high",
      status: "open",
      createdAt: new Date("2024-01-01T09:00:00Z"),
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(makeMockBatch());
  mockFindMany.mockResolvedValue([makeMockMeta()]);
});

// ─── CSV Tests ───────────────────────────────────────────────────────────────

describe("exportBatchAsCsv", () => {
  it("header row contains all expected columns in order", async () => {
    const csv = await exportBatchAsCsv("batch-1");
    const header = csv.split("\n")[0];
    const expected = [
      "ticketId", "title", "description", "category", "product", "severity",
      "status", "createdAt", "trueRootCause", "trueCategory", "trueSeverity",
      "affectedProduct", "injectedFaults", "difficulty", "scenario",
      "scenarioRole", "overallScore", "passed",
    ];
    expect(header).toBe(expected.join(","));
  });

  it("wraps value containing comma in double-quotes", async () => {
    mockFindMany.mockResolvedValue([
      makeMockMeta({ ticket: { ...makeMockMeta().ticket, title: "Slow, broken login" } }),
    ]);
    const csv = await exportBatchAsCsv("batch-1");
    expect(csv).toContain('"Slow, broken login"');
  });

  it("escapes double-quotes inside values as two double-quotes", async () => {
    mockFindMany.mockResolvedValue([
      makeMockMeta({ ticket: { ...makeMockMeta().ticket, title: 'Error: "auth" failed' } }),
    ]);
    const csv = await exportBatchAsCsv("batch-1");
    expect(csv).toContain('"Error: ""auth"" failed"');
  });

  it("wraps value containing newline in double-quotes", async () => {
    mockFindMany.mockResolvedValue([
      makeMockMeta({ ticket: { ...makeMockMeta().ticket, description: "Line one\nLine two" } }),
    ]);
    const csv = await exportBatchAsCsv("batch-1");
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("serializes injectedFaults array with pipe separator", async () => {
    const csv = await exportBatchAsCsv("batch-1");
    expect(csv).toContain("misleading log|red herring metric");
  });

  it("serializes null values as empty string", async () => {
    const csv = await exportBatchAsCsv("batch-1");
    const lines = csv.split("\n");
    const dataLine = lines[1];
    // scenario and scenarioRole are null — they appear as empty fields (consecutive commas)
    expect(dataLine).toMatch(/,,/);
  });
});

// ─── JSON Tests ───────────────────────────────────────────────────────────────

describe("exportBatchAsJson", () => {
  it("top-level structure has batch and tickets keys", async () => {
    const json = JSON.parse(await exportBatchAsJson("batch-1"));
    expect(json).toHaveProperty("batch");
    expect(json).toHaveProperty("tickets");
  });

  it("tickets array length matches mock data count", async () => {
    mockFindMany.mockResolvedValue([makeMockMeta(), makeMockMeta()]);
    const json = JSON.parse(await exportBatchAsJson("batch-1"));
    expect(json.tickets).toHaveLength(2);
  });

  it("all ground-truth fields present on each ticket entry", async () => {
    const json = JSON.parse(await exportBatchAsJson("batch-1"));
    const ticket = json.tickets[0];
    expect(ticket).toHaveProperty("trueRootCause");
    expect(ticket).toHaveProperty("trueCategory");
    expect(ticket).toHaveProperty("trueSeverity");
    expect(ticket).toHaveProperty("injectedFaults");
    expect(ticket.trueRootCause).toBe("Memory leak in auth service");
    expect(ticket.injectedFaults).toEqual(["misleading log", "red herring metric"]);
  });
});

// ─── Markdown Tests ───────────────────────────────────────────────────────────

describe("exportBatchAsMarkdown", () => {
  it("output starts with '# Batch Export:' header", async () => {
    const md = await exportBatchAsMarkdown("batch-1");
    expect(md.startsWith("# Batch Export:")).toBe(true);
  });

  it("each ticket appears as '## {title}' section", async () => {
    const md = await exportBatchAsMarkdown("batch-1");
    expect(md).toContain("## Login is slow");
  });

  it("Ground Truth section appears for each ticket", async () => {
    const md = await exportBatchAsMarkdown("batch-1");
    expect(md).toContain("### Ground Truth");
    expect(md).toContain("**True Root Cause:**");
  });

  it("injectedFaults appear in ground truth when non-empty", async () => {
    const md = await exportBatchAsMarkdown("batch-1");
    expect(md).toContain("**Injected Faults:**");
    expect(md).toContain("misleading log");
  });

  it("injectedFaults line is omitted when array is empty", async () => {
    mockFindMany.mockResolvedValue([makeMockMeta({ injectedFaults: [] })]);
    const md = await exportBatchAsMarkdown("batch-1");
    expect(md).not.toContain("**Injected Faults:**");
  });
});
