import { describe, it, expect } from "vitest";
import { buildReproductionPrompt, buildFixPrompt, type DevinTaskContext } from "@/lib/integrations/devin/prompt-builder";

function makeContext(overrides?: Partial<DevinTaskContext>): DevinTaskContext {
  return {
    ticket: {
      title: "Login fails with 500 error",
      description: "Users report a 500 error when trying to log in after the latest deploy.",
      severity: "high",
      category: "authentication",
    },
    customer: {
      name: "Jane Doe",
      company: "Acme Corp",
      plan: "enterprise",
      region: "us-east-1",
      email: "jane@acme.com",
    },
    hypotheses: [
      {
        id: "h1",
        title: "JWT token expiry misconfigured",
        description: "The token TTL was set to 0 in the latest deploy",
        confidence: 85,
        evidence: ["Log entry showing expired token", "Deploy changed auth config"],
        recommendedAction: "Check JWT TTL configuration",
      },
    ],
    logs: [
      {
        id: "l1",
        timestamp: "2024-01-16T10:00:00Z",
        level: "error",
        service: "auth-service",
        customerId: "cust-1",
        message: "JWT validation failed: token expired",
      },
    ],
    knowledgeChunks: [
      {
        id: "kb1",
        sourcePath: "knowledge-base/auth-troubleshooting.md",
        chunkIndex: 0,
        content: "When JWT tokens fail validation, check the TOKEN_TTL env var.",
      },
    ],
    incidents: [
      {
        id: "inc1",
        title: "Auth service degradation",
        status: "investigating",
        severity: "P1",
        affectedProducts: ["auth"],
        affectedRegions: ["us-east-1"],
        startTime: "2024-01-16T09:00:00Z",
        endTime: null,
        rootCause: "Unknown",
        resolution: "",
        customerImpact: "Users cannot log in",
      },
    ],
    deployments: [
      {
        id: "d1",
        service: "auth-service",
        version: "2.3.1",
        timestamp: "2024-01-16T08:00:00Z",
        author: "dev@company.com",
        environment: "production",
        region: "us-east-1",
        status: "deployed",
        changedEnvVars: ["TOKEN_TTL"],
        notes: "Updated auth config",
      },
    ],
    classification: {
      category: "authentication",
      severity: "high",
      affectedProduct: "auth",
      summary: "Login failures post-deploy",
    },
    escalationNote: null,
    repoUrl: "https://github.com/acme/backend",
    ...overrides,
  };
}

describe("buildReproductionPrompt", () => {
  it("contains DO NOT code change instructions", () => {
    const prompt = buildReproductionPrompt(makeContext());
    expect(prompt).toContain("DO NOT create branches");
    expect(prompt).toContain("DO NOT modify source code");
    expect(prompt).toContain("DO NOT open Pull Requests");
  });

  it("includes ticket title, hypotheses, and log entries", () => {
    const prompt = buildReproductionPrompt(makeContext());
    expect(prompt).toContain("Login fails with 500 error");
    expect(prompt).toContain("JWT token expiry misconfigured");
    expect(prompt).toContain("JWT validation failed");
  });

  it("wraps evidence in untrusted delimiters", () => {
    const prompt = buildReproductionPrompt(makeContext());
    expect(prompt).toContain("--- BEGIN UNTRUSTED EVIDENCE ---");
    expect(prompt).toContain("--- END UNTRUSTED EVIDENCE ---");
  });

  it("redacts email addresses from customer context", () => {
    const ctx = makeContext({ customer: { name: "Jane Doe", company: "Acme Corp", plan: "enterprise", region: "us-east-1", email: "jane@acme.com" } });
    const prompt = buildReproductionPrompt(ctx);
    // Email should not appear raw - it's only in customer.email which isn't directly used in prompt
    expect(prompt).not.toContain("jane@acme.com");
  });

  it("truncates log entries over 500 chars", () => {
    const longLog = "A".repeat(600);
    const ctx = makeContext({
      logs: [{ id: "l1", timestamp: "2024-01-16T10:00:00Z", level: "error", service: "svc", customerId: "c1", message: longLog }],
    });
    const prompt = buildReproductionPrompt(ctx);
    expect(prompt).toContain("[TRUNCATED]");
    expect(prompt.length).toBeLessThan(60000);
  });

  it("truncates knowledge chunks over 2000 chars", () => {
    const longChunk = "B".repeat(2500);
    const ctx = makeContext({
      knowledgeChunks: [{ id: "kb1", sourcePath: "doc.md", chunkIndex: 0, content: longChunk }],
    });
    const prompt = buildReproductionPrompt(ctx);
    expect(prompt).toContain("[TRUNCATED]");
  });

  it("stays under 50K chars with large inputs", () => {
    const ctx = makeContext({
      logs: Array.from({ length: 20 }, (_, i) => ({
        id: `l${i}`, timestamp: "2024-01-16T10:00:00Z", level: "error",
        service: "svc", customerId: "c1", message: "X".repeat(500),
      })),
      knowledgeChunks: Array.from({ length: 10 }, (_, i) => ({
        id: `kb${i}`, sourcePath: `doc${i}.md`, chunkIndex: 0, content: "Y".repeat(2000),
      })),
    });
    const prompt = buildReproductionPrompt(ctx);
    expect(prompt.length).toBeLessThanOrEqual(50000 + 20); // small buffer for truncation marker
  });
});

describe("buildFixPrompt", () => {
  it("contains authorization and PR instructions", () => {
    const ctx = makeContext({
      approvedReply: "We found the issue with JWT config.",
      reviewerNote: "Confirmed by eng team",
    });
    const prompt = buildFixPrompt(ctx);
    expect(prompt).toContain("Authorized Fix");
    expect(prompt).toContain("Pull Request");
    expect(prompt).toContain("AUTHORIZATION");
    expect(prompt).toContain("PR REQUIREMENTS");
  });

  it("includes approved reply and reviewer notes", () => {
    const ctx = makeContext({
      approvedReply: "We found the issue with JWT config.",
      reviewerNote: "Confirmed by eng team",
    });
    const prompt = buildFixPrompt(ctx);
    expect(prompt).toContain("We found the issue with JWT config.");
    expect(prompt).toContain("Confirmed by eng team");
  });

  it("wraps evidence in untrusted delimiters", () => {
    const prompt = buildFixPrompt(makeContext());
    expect(prompt).toContain("--- BEGIN UNTRUSTED EVIDENCE ---");
    expect(prompt).toContain("--- END UNTRUSTED EVIDENCE ---");
  });

  it("includes STOP CONDITIONS", () => {
    const prompt = buildFixPrompt(makeContext());
    expect(prompt).toContain("STOP CONDITIONS");
    expect(prompt).toContain("production database credentials");
  });
});
