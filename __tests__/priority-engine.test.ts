import { describe, it, expect } from "vitest";
import {
  calculatePriority,
  scoreToBand,
  explainPriority,
  type PriorityContext,
} from "@/lib/priority-engine";

describe("Priority Engine", () => {
  describe("scoreToBand", () => {
    it("returns URGENT for scores >= 80", () => {
      expect(scoreToBand(80)).toBe("URGENT");
      expect(scoreToBand(95)).toBe("URGENT");
      expect(scoreToBand(100)).toBe("URGENT");
    });

    it("returns HIGH for scores 60-79", () => {
      expect(scoreToBand(60)).toBe("HIGH");
      expect(scoreToBand(79)).toBe("HIGH");
    });

    it("returns MEDIUM for scores 30-59", () => {
      expect(scoreToBand(30)).toBe("MEDIUM");
      expect(scoreToBand(59)).toBe("MEDIUM");
    });

    it("returns LOW for scores < 30", () => {
      expect(scoreToBand(0)).toBe("LOW");
      expect(scoreToBand(29)).toBe("LOW");
    });
  });

  describe("calculatePriority", () => {
    it("scores critical severity higher than low", () => {
      const critical = calculatePriority({ severity: "critical" });
      const low = calculatePriority({ severity: "low" });
      expect(critical.score).toBeGreaterThan(low.score);
    });

    it("scores enterprise customer higher than free", () => {
      const enterprise = calculatePriority({ customerTier: "enterprise" });
      const free = calculatePriority({ customerTier: "free" });
      expect(enterprise.score).toBeGreaterThan(free.score);
    });

    it("returns score between 0 and 100", () => {
      const result = calculatePriority({
        severity: "critical",
        customerTier: "enterprise",
        slaRemainingMinutes: 0,
        incidentSeverity: "P0",
        sentiment: "frustrated",
        blockedParty: "customer",
        manualBoost: 20,
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("assigns URGENT band for combined critical factors", () => {
      const result = calculatePriority({
        severity: "critical",
        customerTier: "enterprise",
        slaRemainingMinutes: 5,
        blockedParty: "customer",
        incidentSeverity: "P0",
        sentiment: "frustrated",
        waitingDurationMinutes: 500,
      });
      expect(result.band).toBe("URGENT");
    });

    it("assigns LOW band for minimal context", () => {
      const result = calculatePriority({
        severity: "low",
        customerTier: "free",
        slaRemainingMinutes: 9999,
      });
      expect(result.band).toBe("LOW");
    });

    it("includes breakdown in result", () => {
      const result = calculatePriority({ severity: "high" });
      expect(result.breakdown).toHaveProperty("severity");
      expect(result.breakdown).toHaveProperty("customerTier");
      expect(result.breakdown).toHaveProperty("slaProximity");
    });

    it("handles manual boost", () => {
      const base = calculatePriority({ severity: "medium" });
      const boosted = calculatePriority({ severity: "medium", manualBoost: 10 });
      expect(boosted.score).toBeGreaterThan(base.score);
    });

    it("handles negative manual boost", () => {
      const base = calculatePriority({ severity: "medium" });
      const deboosted = calculatePriority({ severity: "medium", manualBoost: -10 });
      expect(deboosted.score).toBeLessThan(base.score);
    });
  });

  describe("explainPriority", () => {
    it("produces human-readable string with score", () => {
      const result = calculatePriority({
        severity: "critical",
        customerTier: "enterprise",
      });
      const explanation = explainPriority(result.breakdown);
      expect(explanation).toContain("/100");
      expect(explanation).toContain("severity");
    });

    it("includes incident factor when present", () => {
      const result = calculatePriority({
        severity: "medium",
        incidentSeverity: "P0",
      });
      const explanation = explainPriority(result.breakdown);
      expect(explanation).toContain("incident");
    });
  });
});
