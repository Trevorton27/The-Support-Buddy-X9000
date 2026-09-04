import { describe, it, expect } from "vitest";
import { isValidTransition, STATE_MACHINE } from "@/lib/work-items";

describe("Work Items State Machine", () => {
  describe("isValidTransition", () => {
    it("allows OPEN → IN_PROGRESS", () => {
      expect(isValidTransition("OPEN", "IN_PROGRESS")).toBe(true);
    });

    it("allows OPEN → SNOOZED", () => {
      expect(isValidTransition("OPEN", "SNOOZED")).toBe(true);
    });

    it("allows IN_PROGRESS → COMPLETED", () => {
      expect(isValidTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    });

    it("allows IN_PROGRESS → WAITING_CUSTOMER", () => {
      expect(isValidTransition("IN_PROGRESS", "WAITING_CUSTOMER")).toBe(true);
    });

    it("allows IN_PROGRESS → WAITING_INTERNAL", () => {
      expect(isValidTransition("IN_PROGRESS", "WAITING_INTERNAL")).toBe(true);
    });

    it("allows WAITING_CUSTOMER → IN_PROGRESS", () => {
      expect(isValidTransition("WAITING_CUSTOMER", "IN_PROGRESS")).toBe(true);
    });

    it("allows SNOOZED → OPEN", () => {
      expect(isValidTransition("SNOOZED", "OPEN")).toBe(true);
    });

    it("allows NEEDS_CLASSIFICATION → OPEN", () => {
      expect(isValidTransition("NEEDS_CLASSIFICATION", "OPEN")).toBe(true);
    });

    it("disallows COMPLETED → any", () => {
      expect(isValidTransition("COMPLETED", "OPEN")).toBe(false);
      expect(isValidTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    });

    it("disallows CANCELLED → any", () => {
      expect(isValidTransition("CANCELLED", "OPEN")).toBe(false);
      expect(isValidTransition("CANCELLED", "IN_PROGRESS")).toBe(false);
    });

    it("disallows OPEN → COMPLETED (must go through IN_PROGRESS)", () => {
      expect(isValidTransition("OPEN", "COMPLETED")).toBe(false);
    });

    it("disallows SNOOZED → COMPLETED", () => {
      expect(isValidTransition("SNOOZED", "COMPLETED")).toBe(false);
    });

    it("disallows unknown states", () => {
      expect(isValidTransition("UNKNOWN", "OPEN")).toBe(false);
    });

    it("all terminal states have no outgoing transitions", () => {
      expect(STATE_MACHINE["COMPLETED"]).toEqual([]);
      expect(STATE_MACHINE["CANCELLED"]).toEqual([]);
    });
  });

  describe("snooze/resume cycle", () => {
    it("OPEN → SNOOZED → OPEN is valid", () => {
      expect(isValidTransition("OPEN", "SNOOZED")).toBe(true);
      expect(isValidTransition("SNOOZED", "OPEN")).toBe(true);
    });

    it("IN_PROGRESS → SNOOZED → OPEN is valid", () => {
      expect(isValidTransition("IN_PROGRESS", "SNOOZED")).toBe(true);
      expect(isValidTransition("SNOOZED", "OPEN")).toBe(true);
    });
  });

  describe("delegate flow", () => {
    it("IN_PROGRESS → OPEN (for reassignment) is valid", () => {
      expect(isValidTransition("IN_PROGRESS", "OPEN")).toBe(true);
    });
  });

  describe("waiting flows", () => {
    it("WAITING_CUSTOMER → COMPLETED is valid", () => {
      expect(isValidTransition("WAITING_CUSTOMER", "COMPLETED")).toBe(true);
    });

    it("WAITING_INTERNAL → COMPLETED is valid", () => {
      expect(isValidTransition("WAITING_INTERNAL", "COMPLETED")).toBe(true);
    });
  });
});
