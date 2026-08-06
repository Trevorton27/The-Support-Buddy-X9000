import { describe, it, expect, vi, beforeEach } from "vitest";
import { suggestClusters } from "@/lib/incident-clustering";

// Mock the Prisma client
vi.mock("@/lib/db", () => ({
  prisma: {
    ticket: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";

const mockFindMany = prisma.ticket.findMany as ReturnType<typeof vi.fn>;

// Helper to build a mock ticket
function makeTicket(
  id: string,
  product: string,
  category: string,
  region: string,
  createdAt: Date
) {
  return {
    id,
    product,
    category,
    status: "open",
    createdAt,
    customer: { region },
    incidents: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("suggestClusters", () => {
  it("returns [] when no tickets exist", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await suggestClusters();
    expect(result).toEqual([]);
  });

  it("returns [] when all tickets have different products", async () => {
    const base = new Date("2024-01-01T10:00:00Z");
    mockFindMany.mockResolvedValue([
      makeTicket("t1", "ProductA", "billing", "us-east", base),
      makeTicket("t2", "ProductB", "billing", "us-east", base),
      makeTicket("t3", "ProductC", "billing", "us-east", base),
    ]);
    const result = await suggestClusters();
    expect(result).toEqual([]);
  });

  it("groups 3 tickets with same product/category/region within 4h into 1 cluster", async () => {
    const t0 = new Date("2024-01-01T10:00:00Z");
    const t1 = new Date("2024-01-01T11:00:00Z");
    const t2 = new Date("2024-01-01T12:00:00Z");
    mockFindMany.mockResolvedValue([
      makeTicket("t1", "Auth", "login", "us-east", t0),
      makeTicket("t2", "Auth", "login", "us-east", t1),
      makeTicket("t3", "Auth", "login", "us-east", t2),
    ]);
    const result = await suggestClusters();
    expect(result).toHaveLength(1);
    expect(result[0].ticketIds).toHaveLength(3);
  });

  it("does NOT cluster 3 tickets when each consecutive pair is > 4h apart", async () => {
    // Each ticket is 5h from the next, so no sliding window anchor can see all 3
    const t0 = new Date("2024-01-01T08:00:00Z");
    const t1 = new Date("2024-01-01T13:00:00Z"); // 5h after t0
    const t2 = new Date("2024-01-01T18:00:00Z"); // 5h after t1, 10h after t0
    mockFindMany.mockResolvedValue([
      makeTicket("t1", "Auth", "login", "us-east", t0),
      makeTicket("t2", "Auth", "login", "us-east", t1),
      makeTicket("t3", "Auth", "login", "us-east", t2),
    ]);
    const result = await suggestClusters();
    // No pair of consecutive tickets is within 4h, so no cluster forms
    expect(result).toHaveLength(0);
  });

  it("creates separate clusters for different regions with same product/category", async () => {
    const t = new Date("2024-01-01T10:00:00Z");
    mockFindMany.mockResolvedValue([
      makeTicket("t1", "Auth", "login", "us-east", t),
      makeTicket("t2", "Auth", "login", "us-east", new Date(t.getTime() + 60000)),
      makeTicket("t3", "Auth", "login", "eu-west", t),
      makeTicket("t4", "Auth", "login", "eu-west", new Date(t.getTime() + 60000)),
    ]);
    const result = await suggestClusters();
    expect(result).toHaveLength(2);
    const regions = result.map((c) => c.affectedRegion).sort();
    expect(regions).toEqual(["eu-west", "us-east"]);
  });

  it("creates separate clusters for different categories with same product/region", async () => {
    const t = new Date("2024-01-01T10:00:00Z");
    mockFindMany.mockResolvedValue([
      makeTicket("t1", "Auth", "login", "us-east", t),
      makeTicket("t2", "Auth", "login", "us-east", new Date(t.getTime() + 60000)),
      makeTicket("t3", "Auth", "mfa", "us-east", t),
      makeTicket("t4", "Auth", "mfa", "us-east", new Date(t.getTime() + 60000)),
    ]);
    const result = await suggestClusters();
    expect(result).toHaveLength(2);
    const categories = result.map((c) => c.category).sort();
    expect(categories).toEqual(["login", "mfa"]);
  });

  it("sets affectedProduct and affectedRegion correctly on the cluster", async () => {
    const t = new Date("2024-01-01T10:00:00Z");
    mockFindMany.mockResolvedValue([
      makeTicket("t1", "Payments", "checkout", "ap-southeast", t),
      makeTicket("t2", "Payments", "checkout", "ap-southeast", new Date(t.getTime() + 30000)),
    ]);
    const result = await suggestClusters();
    expect(result).toHaveLength(1);
    expect(result[0].affectedProduct).toBe("Payments");
    expect(result[0].affectedRegion).toBe("ap-southeast");
  });

  it("ticketIds length matches the number of input tickets in the cluster", async () => {
    const t = new Date("2024-01-01T10:00:00Z");
    const tickets = Array.from({ length: 4 }, (_, i) =>
      makeTicket(`t${i + 1}`, "Storage", "upload", "us-west", new Date(t.getTime() + i * 900000))
    );
    mockFindMany.mockResolvedValue(tickets);
    const result = await suggestClusters();
    // All 4 within 4h window (3 × 15min gaps = 45min total)
    expect(result).toHaveLength(1);
    expect(result[0].ticketIds).toHaveLength(4);
  });
});
