import { describe, it, expect } from "vitest";
import { GenerationParamsSchema } from "@/lib/generation/schema";

const validBase = {
  mode: "wizard" as const,
  count: 5,
  products: ["Auth Service"],
  categories: ["login"],
  severityWeights: { critical: 10, high: 30, medium: 40, low: 20 },
  realism: { misleadingLogs: false, noiseLevel: "none" as const, herringCount: 0 },
};

describe("GenerationParamsSchema", () => {
  it("valid minimal params pass validation", () => {
    const result = GenerationParamsSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("count: 0 fails validation", () => {
    const result = GenerationParamsSchema.safeParse({ ...validBase, count: 0 });
    expect(result.success).toBe(false);
  });

  it("count: 201 fails validation", () => {
    const result = GenerationParamsSchema.safeParse({ ...validBase, count: 201 });
    expect(result.success).toBe(false);
  });

  it("count: 200 passes validation (boundary)", () => {
    const result = GenerationParamsSchema.safeParse({ ...validBase, count: 200 });
    expect(result.success).toBe(true);
  });

  it("mode: 'invalid' fails validation", () => {
    const result = GenerationParamsSchema.safeParse({ ...validBase, mode: "invalid" });
    expect(result.success).toBe(false);
  });

  it("missing products array fails validation", () => {
    const { products: _, ...rest } = validBase;
    const result = GenerationParamsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("empty products array fails validation", () => {
    const result = GenerationParamsSchema.safeParse({ ...validBase, products: [] });
    expect(result.success).toBe(false);
  });

  it("severityWeights value > 100 fails validation", () => {
    const result = GenerationParamsSchema.safeParse({
      ...validBase,
      severityWeights: { critical: 101, high: 0, medium: 0, low: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("realism.noiseLevel: 'extreme' (invalid enum) fails validation", () => {
    const result = GenerationParamsSchema.safeParse({
      ...validBase,
      realism: { ...validBase.realism, noiseLevel: "extreme" },
    });
    expect(result.success).toBe(false);
  });

  it("incidentScenario.ticketCount < 2 fails when provided", () => {
    const result = GenerationParamsSchema.safeParse({
      ...validBase,
      mode: "incident",
      incidentScenario: {
        name: "DB Outage",
        description: "DB is down",
        products: ["DB"],
        region: "us-east",
        ticketCount: 1, // below min of 2
        rootCause: "Disk full",
      },
    });
    expect(result.success).toBe(false);
  });

  it("realism.herringCount: 4 (above max 3) fails", () => {
    const result = GenerationParamsSchema.safeParse({
      ...validBase,
      realism: { ...validBase.realism, herringCount: 4 },
    });
    expect(result.success).toBe(false);
  });

  it("optional customerId absent — passes validation", () => {
    const result = GenerationParamsSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customerId).toBeUndefined();
    }
  });

  it("realism defaults are applied correctly when partial realism provided", () => {
    const result = GenerationParamsSchema.safeParse({
      ...validBase,
      realism: {}, // let defaults kick in
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.realism.misleadingLogs).toBe(false);
      expect(result.data.realism.noiseLevel).toBe("none");
      expect(result.data.realism.herringCount).toBe(0);
    }
  });
});
