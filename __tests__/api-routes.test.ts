/**
 * API route unit tests — import handlers directly, no HTTP server required.
 *
 * Mocks: @/lib/db, @/lib/auth, @/inngest/client,
 *        @/lib/generation/ticket-generator, @/lib/generation/training-scorer
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    generationBatch: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    ticket: { create: vi.fn() },
    generatedTicketMeta: { create: vi.fn(), findMany: vi.fn() },
    investigationRun: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(),
  requireOrgAuth: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/generation/ticket-generator", () => ({
  generateTicketBatch: vi.fn(),
}));

vi.mock("@/lib/generation/training-scorer", () => ({
  scoreTrainingRun: vi.fn(),
}));

vi.mock("@/lib/generation/dataset-exporter", () => ({
  exportBatchAsCsv: vi.fn().mockResolvedValue("ticketId,title\nt1,Test"),
  exportBatchAsJson: vi.fn().mockResolvedValue('{"batch":{},"tickets":[]}'),
  exportBatchAsMarkdown: vi.fn().mockResolvedValue("# Batch Export: Test"),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { requireAuth, requireOrgAuth, auth as appAuth } from "@/lib/auth";
import { generateTicketBatch } from "@/lib/generation/ticket-generator";
import { scoreTrainingRun } from "@/lib/generation/training-scorer";

import { POST as postBatches } from "@/app/api/generate/batches/route";
import { GET as getBatchById } from "@/app/api/generate/batches/[batchId]/route";
import { GET as exportBatch } from "@/app/api/generate/batches/[batchId]/export/route";
import { POST as postScore } from "@/app/api/training/score/route";
import { GET as getLeaderboard } from "@/app/api/training/leaderboard/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockRequireOrgAuth = requireOrgAuth as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockAuth = appAuth as unknown as ReturnType<typeof vi.fn>;
const mockGenerateBatch = generateTicketBatch as ReturnType<typeof vi.fn>;
const mockScoreRun = scoreTrainingRun as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as typeof prisma;

function authedOrg(userId = "user-1", orgId = "org-1") {
  mockRequireOrgAuth.mockResolvedValue({ userId, orgId, orgRole: "admin", response: null });
}

function authed(userId = "user-1") {
  mockRequireAuth.mockResolvedValue({ userId, response: null });
}

function unauthed() {
  const res401 = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  mockRequireOrgAuth.mockResolvedValue({ userId: null, orgId: null, orgRole: null, response: res401 });
  mockRequireAuth.mockResolvedValue({ userId: null, response: res401 });
}

function makeRequest(url: string, init?: RequestInit): NextRequest {
  // Construct via Request so the standard RequestInit type is used,
  // avoiding the stricter NextRequest-specific init type.
  return new NextRequest(new Request(url, init));
}

const BATCH_URL = "http://localhost/api/generate/batches";
const VALID_BODY = {
  mode: "wizard",
  count: 3,
  products: ["Auth"],
  categories: ["login"],
  severityWeights: { critical: 10, high: 30, medium: 40, low: 20 },
  realism: { misleadingLogs: false, noiseLevel: "none", herringCount: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: leaderboard auth
  mockAuth.mockResolvedValue({ orgId: "org-1" });
});

// ─── POST /api/generate/batches ───────────────────────────────────────────────

describe("POST /api/generate/batches", () => {
  it("returns 401 when auth returns no userId", async () => {
    unauthed();
    const req = makeRequest(BATCH_URL, {
      method: "POST",
      body: JSON.stringify(VALID_BODY),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBatches(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is malformed JSON", async () => {
    authedOrg();
    const req = makeRequest(BATCH_URL, {
      method: "POST",
      body: "{ invalid json }",
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBatches(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when mode is missing", async () => {
    authedOrg();
    const { mode: _, ...noMode } = VALID_BODY;
    const req = makeRequest(BATCH_URL, {
      method: "POST",
      body: JSON.stringify(noMode),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBatches(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when no customers found in DB", async () => {
    authedOrg();
    (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = makeRequest(BATCH_URL, {
      method: "POST",
      body: JSON.stringify(VALID_BODY),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBatches(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/No customers/i);
  });

  it("returns 201 with batchId and status=complete on sync batch (count <= 25)", async () => {
    authedOrg();
    (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cust-1",
      orgId: "org-1",
    });
    (mockPrisma.generationBatch.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "batch-abc",
      name: "wizard batch",
    });
    (mockPrisma.generationBatch.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (mockPrisma.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "ticket-1" });
    (mockPrisma.generatedTicketMeta.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    mockGenerateBatch.mockResolvedValue([
      {
        title: "Test ticket",
        description: "desc",
        severity: "high",
        category: "login",
        product: "Auth",
        trueRootCause: "Root cause",
        trueCategory: "login",
        trueSeverity: "high",
        affectedProduct: "Auth",
        injectedFaults: [],
        difficulty: "easy",
        scenarioRole: null,
      },
    ]);
    const req = makeRequest(BATCH_URL, {
      method: "POST",
      body: JSON.stringify(VALID_BODY),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBatches(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("complete");
    expect(body.batchId).toBe("batch-abc");
    expect(Array.isArray(body.ticketIds)).toBe(true);
  });

  it("returns 202 with status=pending when count > 25 (Inngest path)", async () => {
    authedOrg();
    (mockPrisma.customer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "cust-1" });
    (mockPrisma.generationBatch.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "batch-big",
    });
    const req = makeRequest(BATCH_URL, {
      method: "POST",
      body: JSON.stringify({ ...VALID_BODY, count: 50 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postBatches(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });
});

// ─── GET /api/generate/batches/[batchId] ─────────────────────────────────────

describe("GET /api/generate/batches/[batchId]", () => {
  it("returns 404 when batch doesn't belong to org", async () => {
    authedOrg();
    (mockPrisma.generationBatch.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = makeRequest("http://localhost/api/generate/batches/batch-xyz");
    const res = await getBatchById(req, { params: Promise.resolve({ batchId: "batch-xyz" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with nested metas when batch is found", async () => {
    authedOrg();
    (mockPrisma.generationBatch.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "batch-1",
      name: "Test Batch",
      metas: [
        {
          id: "meta-1",
          ticket: { id: "t-1", title: "Ticket", severity: "high", status: "open", createdAt: new Date() },
        },
      ],
    });
    const req = makeRequest("http://localhost/api/generate/batches/batch-1");
    const res = await getBatchById(req, { params: Promise.resolve({ batchId: "batch-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batch).toHaveProperty("metas");
    expect(body.batch.metas).toHaveLength(1);
  });
});

// ─── GET /api/generate/batches/[batchId]/export ───────────────────────────────

describe("GET /api/generate/batches/[batchId]/export", () => {
  beforeEach(() => {
    authedOrg();
  });

  it("returns CSV with correct Content-Type when format=csv", async () => {
    const req = makeRequest(
      "http://localhost/api/generate/batches/batch-1/export?format=csv"
    );
    const res = await exportBatch(req, { params: Promise.resolve({ batchId: "batch-1" }) });
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("batch-1.csv");
  });

  it("returns JSON by default when no format param", async () => {
    const req = makeRequest("http://localhost/api/generate/batches/batch-1/export");
    const res = await exportBatch(req, { params: Promise.resolve({ batchId: "batch-1" }) });
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("batch-1.json");
  });
});

// ─── POST /api/training/score ─────────────────────────────────────────────────

describe("POST /api/training/score", () => {
  it("returns 401 when unauthenticated", async () => {
    unauthed();
    const req = makeRequest("http://localhost/api/training/score", {
      method: "POST",
      body: JSON.stringify({ investigationRunId: "run-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postScore(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 when run has no generatedMeta", async () => {
    authed();
    (mockPrisma.investigationRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "run-1",
      hypotheses: [],
      summary: null,
      ticket: {
        id: "t-1",
        title: "Test",
        description: "desc",
        severity: "high",
        generatedMeta: null, // no meta — training run check fails
      },
      steps: [],
    });
    const req = makeRequest("http://localhost/api/training/score", {
      method: "POST",
      body: JSON.stringify({ investigationRunId: "run-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postScore(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/no generated metadata/i);
  });

  it("returns 200 with scores when valid run and meta provided", async () => {
    authed();
    (mockPrisma.investigationRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "run-1",
      hypotheses: [{ title: "Memory leak", confidence: 0.9, evidence: ["log line"] }],
      summary: "Memory leak detected",
      ticket: {
        id: "t-1",
        title: "Slow login",
        description: "Login is slow",
        severity: "high",
        generatedMeta: {
          id: "meta-1",
          trueRootCause: "Memory leak in auth",
          trueSeverity: "high",
          injectedFaults: [],
          difficulty: "easy",
        },
      },
      steps: [],
    });
    (mockPrisma.generatedTicketMeta as unknown as Record<string, ReturnType<typeof vi.fn>>).update =
      vi.fn().mockResolvedValue({});
    mockScoreRun.mockResolvedValue({
      rootCauseScore: 0.9,
      severityScore: 1.0,
      deceptionResistanceScore: 1.0,
      overallScore: 0.95,
      passed: true,
      reasoning: "Good job",
    });
    const req = makeRequest("http://localhost/api/training/score", {
      method: "POST",
      body: JSON.stringify({ investigationRunId: "run-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postScore(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overallScore).toBeCloseTo(0.95);
    expect(body.passed).toBe(true);
  });
});

// ─── GET /api/training/leaderboard ───────────────────────────────────────────

describe("GET /api/training/leaderboard", () => {
  it("returns { stats: [] } when no scored metas exist", async () => {
    authed();
    mockAuth.mockResolvedValue({ orgId: "org-1" });
    (mockPrisma.generatedTicketMeta.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toEqual([]);
  });

  it("returns grouped stats by difficulty when scored metas exist", async () => {
    authed();
    mockAuth.mockResolvedValue({ orgId: "org-1" });
    (mockPrisma.generatedTicketMeta.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        difficulty: "easy",
        scoreCache: { rootCauseScore: 1.0, severityScore: 1.0, deceptionResistanceScore: 1.0, overallScore: 1.0, passed: true },
      },
      {
        difficulty: "hard",
        scoreCache: { rootCauseScore: 0.5, severityScore: 0.6, deceptionResistanceScore: 0.4, overallScore: 0.5, passed: false },
      },
    ]);
    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toHaveLength(2);
    const difficulties = body.stats.map((s: { difficulty: string }) => s.difficulty).sort();
    expect(difficulties).toEqual(["easy", "hard"]);
  });
});
