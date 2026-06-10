import { describe, it, expect } from "vitest";
import { runDeterministicChecks } from "@/lib/guardrails-rules";

describe("runDeterministicChecks", () => {
  describe("clean text", () => {
    it("returns no flags for safe text", () => {
      const flags = runDeterministicChecks("Your request has been received and is being processed.");
      expect(flags).toHaveLength(0);
    });

    it("returns no flags for empty string", () => {
      expect(runDeterministicChecks("")).toHaveLength(0);
    });
  });

  describe("PII detection", () => {
    it("flags email addresses", () => {
      const flags = runDeterministicChecks("Please contact user@example.com for more info.");
      const emailFlag = flags.find((f) => f.description === "Email address detected");
      expect(emailFlag).toBeDefined();
      expect(emailFlag?.type).toBe("pii");
      expect(emailFlag?.severity).toBe("block");
    });

    it("flags US phone numbers", () => {
      const flags = runDeterministicChecks("Call us at 555-867-5309.");
      const phoneFlag = flags.find((f) => f.description === "Phone number detected");
      expect(phoneFlag).toBeDefined();
      expect(phoneFlag?.type).toBe("pii");
    });

    it("flags SSN patterns", () => {
      const flags = runDeterministicChecks("SSN: 123-45-6789");
      const ssnFlag = flags.find((f) => f.description === "SSN pattern detected");
      expect(ssnFlag).toBeDefined();
      expect(ssnFlag?.severity).toBe("block");
    });

    it("flags Visa credit card numbers", () => {
      const flags = runDeterministicChecks("Card: 4111111111111111");
      const ccFlag = flags.find((f) => f.description === "Credit card number pattern detected");
      expect(ccFlag).toBeDefined();
    });
  });

  describe("secret detection", () => {
    it("flags OpenAI-style secret keys", () => {
      const flags = runDeterministicChecks("Key: sk-abcdefghijklmnopqrstuvwxyz1234567890abcd");
      const secretFlag = flags.find((f) => f.description === "OpenAI-style secret key detected");
      expect(secretFlag).toBeDefined();
      expect(secretFlag?.type).toBe("secret");
      expect(secretFlag?.severity).toBe("block");
    });

    it("flags GitHub personal access tokens", () => {
      const flags = runDeterministicChecks("Token: GHP_FAKE_TOKEN_FOR_TESTING000000000000");
      const ghFlag = flags.find((f) => f.description === "GitHub personal access token detected");
      expect(ghFlag).toBeDefined();
    });

    it("flags Slack bot tokens", () => {
      const flags = runDeterministicChecks("Bot token: SLACK_FAKE_TOKEN_FOR_TESTING");
      const slackFlag = flags.find((f) => f.description === "Slack bot token detected");
      expect(slackFlag).toBeDefined();
    });

    it("flags generic api_key patterns", () => {
      const flags = runDeterministicChecks('api_key="abcdefghijklmnopqrstuvwxyz123456"');
      const apiFlag = flags.find((f) => f.description === "Potential API key or secret detected");
      expect(apiFlag).toBeDefined();
    });
  });

  describe("internal content detection", () => {
    it("flags [INTERNAL] tags", () => {
      const flags = runDeterministicChecks("This reply contains [INTERNAL] information.");
      const internalFlag = flags.find((f) => f.description === "Internal tag detected");
      expect(internalFlag).toBeDefined();
      expect(internalFlag?.type).toBe("internal_leak");
      expect(internalFlag?.severity).toBe("warn");
    });

    it("flags [CONFIDENTIAL] tags", () => {
      const flags = runDeterministicChecks("[CONFIDENTIAL] Do not share this.");
      const flag = flags.find((f) => f.description === "Internal tag detected");
      expect(flag).toBeDefined();
    });

    it("flags 'do not share' language", () => {
      const flags = runDeterministicChecks("Please do not share this information externally.");
      const flag = flags.find((f) => f.description === "Confidentiality marker detected");
      expect(flag).toBeDefined();
      expect(flag?.severity).toBe("warn");
    });

    it("flags 'internal use only' phrases", () => {
      const flags = runDeterministicChecks("This document is for internal use only.");
      const flag = flags.find((f) => f.description === "Internal-only content marker detected");
      expect(flag).toBeDefined();
    });
  });

  describe("multiple flags", () => {
    it("returns multiple flags when several violations present", () => {
      const text = "Contact user@example.com — token: sk-abcdefghijklmnopqrstuvwxyz1234567890abcd";
      const flags = runDeterministicChecks(text);
      expect(flags.length).toBeGreaterThanOrEqual(2);
      expect(flags.some((f) => f.type === "pii")).toBe(true);
      expect(flags.some((f) => f.type === "secret")).toBe(true);
    });
  });

  describe("flag shape", () => {
    it("includes location string on each flag", () => {
      const flags = runDeterministicChecks("Reach me at test@test.com anytime.");
      expect(flags[0]).toHaveProperty("location");
      expect(typeof flags[0].location).toBe("string");
    });
  });
});
