import type { BugTemplate } from "./types";

/**
 * Bug templates that can be injected into the demo product repo.
 *
 * Each template defines:
 * - The buggy code to inject
 * - The correct code (for verification / reset)
 * - A test that fails with the bug and passes with the fix
 * - A matching support ticket to auto-create
 *
 * Templates use a marker pattern: the source file contains the fixedCode,
 * and injection replaces it with buggyCode.
 */
export const BUG_TEMPLATES: BugTemplate[] = [
  // ─── auth-service ───────────────────────────────────────
  {
    id: "auth-cert-region-mismatch",
    service: "auth-service",
    title: "Certificate selection ignores region parameter",
    description:
      "getCertificateForRegion returns the first active certificate instead of filtering by region, causing EU users to get US certificates.",
    filePath: "services/auth-service/src/saml/validator.ts",
    category: "authentication",
    severity: "critical",
    difficulty: "easy",
    buggyCode: `  return activeCerts[0];`,
    fixedCode: `  return activeCerts.find((c) => c.region === region) ?? null;`,
    testFilePath: "services/auth-service/tests/saml-validator.test.ts",
    testCode: `import { describe, it, expect } from "vitest";
import { getCertificateForRegion } from "../src/saml/validator";

const certs = [
  { id: "cert_us", region: "us-east-1", publicKey: "us-key", expiresAt: new Date("2025-12-31"), active: true },
  { id: "cert_eu", region: "eu-west-1", publicKey: "eu-key", expiresAt: new Date("2025-12-31"), active: true },
];

describe("region certificate selection regression", () => {
  it("should return EU cert for eu-west-1 region", () => {
    const cert = getCertificateForRegion("eu-west-1", certs);
    expect(cert?.region).toBe("eu-west-1");
  });
});`,
    ticket: {
      title: "SAML SSO authentication failing for EU users after certificate rotation",
      description:
        "Following the scheduled certificate rotation, EU-based employees can no longer authenticate via SAML SSO. They receive 'SAML assertion signature validation failed' error. US users on the same IdP are unaffected. 450 EU employees are blocked from the platform.",
      severity: "critical",
      category: "authentication",
      product: "auth-service",
    },
    deployment: {
      service: "auth-service",
      version: "v1.9.5",
      changedEnvVars: ["SAML_CERT_PATH", "JWT_SIGNING_KEY_ID"],
      notes: "Certificate rotation as part of quarterly security maintenance. EU cluster update failed silently.",
    },
  },

  {
    id: "auth-stale-org-context",
    service: "auth-service",
    title: "Session returns stale organization context after org switch",
    description:
      "getOrCreateSession returns existing session without checking if organizationId changed, causing users to see data from previous org.",
    filePath: "services/auth-service/src/session/context.ts",
    category: "authentication",
    severity: "high",
    difficulty: "easy",
    buggyCode: `  if (existing) {
    existing.lastAccessedAt = new Date();
    return existing;
  }`,
    fixedCode: `  if (existing && existing.organizationId === organizationId) {
    existing.lastAccessedAt = new Date();
    return existing;
  }
  if (existing) {
    sessionStore.delete(sessionId);
  }`,
    testFilePath: "services/auth-service/tests/session-org-switch.test.ts",
    testCode: `import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreateSession, _resetStore } from "../src/session/context";

beforeEach(() => _resetStore());

describe("organization switch regression", () => {
  it("should return new org context after switching organizations", () => {
    getOrCreateSession("sess_1", "user_1", "org_alpha", "us-east-1");
    const session = getOrCreateSession("sess_1", "user_1", "org_beta", "us-east-1");
    expect(session.organizationId).toBe("org_beta");
  });
});`,
    ticket: {
      title: "Organization switcher shows data from previous organization",
      description:
        "When users switch between organizations using the org switcher, they continue to see dashboards, tickets, and settings from the previous organization. Logging out and back in resolves the issue temporarily. This is a significant data isolation concern for our multi-tenant setup.",
      severity: "high",
      category: "authentication",
      product: "auth-service",
    },
  },

  // ─── webhook-dispatcher ─────────────────────────────────
  {
    id: "webhook-legacy-header",
    service: "webhook-dispatcher",
    title: "Signature verifier ignores legacy X-Webhook-Sig header",
    description:
      "After the v3.1.2 deploy, only X-Signature-256 is checked. Customers still sending X-Webhook-Sig get 'header not present' errors.",
    filePath: "services/webhook-dispatcher/src/middleware/signatureVerifier.ts",
    category: "integration",
    severity: "high",
    difficulty: "easy",
    buggyCode: `  const signature = request.headers["x-signature-256"];`,
    fixedCode: `  const signature = request.headers["x-signature-256"] ?? request.headers["x-webhook-sig"];`,
    testFilePath: "services/webhook-dispatcher/tests/legacy-header.test.ts",
    testCode: `import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "../src/middleware/signatureVerifier";

const SECRET = "whsec_test";
const BODY = '{"event":"test"}';

describe("legacy header regression", () => {
  it("should accept X-Webhook-Sig header from pre-v3.1.2 integrations", () => {
    const sig = \`sha256=\${createHmac("sha256", SECRET).update(BODY).digest("hex")}\`;
    const result = verifyWebhookSignature({ headers: { "x-webhook-sig": sig }, body: BODY }, SECRET);
    expect(result.valid).toBe(true);
  });
});`,
    ticket: {
      title: "Webhook events not being delivered - 30% failure rate",
      description:
        "Our webhook endpoint was working fine until 3 days ago. Now approximately 30% of events fail to deliver. The retry mechanism doesn't seem to be working either. Webhook signature verification is enabled. Error in our logs: 'HMAC header X-Webhook-Sig not present'.",
      severity: "high",
      category: "integration",
      product: "webhook-dispatcher",
    },
    deployment: {
      service: "webhook-dispatcher",
      version: "v3.1.2",
      changedEnvVars: ["WEBHOOK_RETRY_ENABLED", "HMAC_ALGORITHM"],
      notes: "Enabled configurable HMAC algorithm. Signature header name changed from X-Webhook-Sig to X-Signature-256.",
    },
  },

  // ─── order-service ──────────────────────────────────────
  {
    id: "order-hardcoded-timeout",
    service: "order-service",
    title: "Query timeout hardcoded instead of using config value",
    description:
      "executeOrderQuery uses hardcoded 3000ms timeout instead of config.timeoutMs, so the deploy that raised it to 10000ms has no effect.",
    filePath: "services/order-service/src/handlers/orderHandler.ts",
    category: "configuration",
    severity: "critical",
    difficulty: "easy",
    buggyCode: `  const effectiveTimeout = 3000;`,
    fixedCode: `  const effectiveTimeout = config.timeoutMs;`,
    testFilePath: "services/order-service/tests/timeout-config.test.ts",
    testCode: `import { describe, it, expect } from "vitest";
import { executeOrderQuery } from "../src/handlers/orderHandler";

describe("timeout configuration regression", () => {
  it("should use configured timeout of 10000ms, not hardcoded 3000ms", async () => {
    const result = await executeOrderQuery(
      { customerId: "cust_001" },
      { timeoutMs: 10000, maxRetries: 2 },
      5000
    );
    expect(result.timedOut).toBe(false);
  });
});`,
    ticket: {
      title: "API returning 500 errors intermittently on /v2/orders endpoint",
      description:
        "Our integration with /v2/orders has been returning HTTP 500 errors approximately 15-20% of the time since yesterday. Error message: 'Internal server error - upstream timeout'. Our reporting queries run 3-8 seconds which should be within the 10s timeout.",
      severity: "critical",
      category: "performance",
      product: "order-service",
    },
    deployment: {
      service: "order-service",
      version: "v2.4.1",
      changedEnvVars: ["DB_POOL_MAX", "QUERY_TIMEOUT_MS"],
      notes: "Increased default query timeout from 3000ms to 10000ms to handle heavy reporting queries.",
    },
  },

  // ─── billing-service ────────────────────────────────────
  {
    id: "billing-key-propagation",
    service: "billing-service",
    title: "API key activation race during rotation",
    description:
      "isKeyActive rejects pending keys during the async activation window, causing 401s for newly rotated keys.",
    filePath: "services/billing-service/src/keys/keyManager.ts",
    category: "authentication",
    severity: "critical",
    difficulty: "medium",
    buggyCode: `  if (key.status !== "active") {
    return { active: false, reason: "Key not yet active" };
  }`,
    fixedCode: `  if (key.status === "pending") {
    const ageMs = Date.now() - key.createdAt.getTime();
    const PROPAGATION_WINDOW_MS = 15 * 60 * 1000;
    if (ageMs <= PROPAGATION_WINDOW_MS) {
      return { active: true };
    }
    return { active: false, reason: "Key pending beyond propagation window" };
  }
  if (key.status !== "active") {
    return { active: false, reason: "Key not yet active" };
  }`,
    testFilePath: "services/billing-service/tests/key-propagation.test.ts",
    testCode: `import { describe, it, expect, beforeEach } from "vitest";
import { createKey, revokeKey, isKeyActive, _resetStore } from "../src/keys/keyManager";

beforeEach(() => _resetStore());

describe("key propagation regression", () => {
  it("should accept pending keys within the propagation window", () => {
    createKey("new_key", "sk_new", "us-east-1");
    const result = isKeyActive("new_key");
    expect(result.active).toBe(true);
  });
});`,
    ticket: {
      title: "Billing API key rotation causing authentication failures",
      description:
        "We attempted to rotate our billing API key via the dashboard as recommended, but the new key returns 401 Unauthorized. The old key is now disabled per the rotation process. We can't process any payments and our monthly billing run is tomorrow.",
      severity: "critical",
      category: "authentication",
      product: "billing-service",
    },
    deployment: {
      service: "billing-service",
      version: "v4.0.3",
      changedEnvVars: ["KEY_PROPAGATION_STRATEGY", "KEY_ACTIVATION_DELAY_MS"],
      notes: "New API key rotation flow. Keys are now async-activated with eventual consistency across regions (5-10 min propagation).",
    },
  },

  // ─── rate-limiter ───────────────────────────────────────
  {
    id: "ratelimit-burst-doublecount",
    service: "rate-limiter",
    title: "Burst counter double-counts requests in same window",
    description:
      "Requests within the burst window are each charged burstMultiplier tokens instead of just 1, causing users to hit limits at ~20% of actual capacity.",
    filePath: "services/rate-limiter/src/tokenBucket.ts",
    category: "data",
    severity: "medium",
    difficulty: "medium",
    buggyCode: `    const cost = state.burstCount > 1 ? config.burstMultiplier : 1;
    state.tokens -= cost;`,
    fixedCode: `    state.tokens -= 1;`,
    testFilePath: "services/rate-limiter/tests/burst-counting.test.ts",
    testCode: `import { describe, it, expect, beforeEach } from "vitest";
import { consumeToken, _resetBuckets } from "../src/tokenBucket";

beforeEach(() => _resetBuckets());

describe("burst counting regression", () => {
  it("should not over-charge for burst requests", () => {
    const config = { maxRequests: 1000, windowMs: 3600000, burstMultiplier: 5, burstWindowMs: 100 };
    const baseTime = Date.now();
    for (let i = 0; i < 5; i++) {
      consumeToken("client_1", config, baseTime + i * 10);
    }
    const result = consumeToken("client_1", config, baseTime + 200);
    expect(result.remaining).toBeGreaterThan(980);
  });
});`,
    ticket: {
      title: "Rate limiting hitting free tier unexpectedly at ~200 requests",
      description:
        "We're on the free tier (1,000 req/hour limit) but hitting rate limits at around 200 requests. Our usage dashboard shows we're well under the limit but the API keeps returning 429. This started after we added burst traffic from a new feature.",
      severity: "medium",
      category: "performance",
      product: "rate-limiter",
    },
    deployment: {
      service: "rate-limiter",
      version: "v2.2.0",
      changedEnvVars: ["BURST_WINDOW_MS", "BURST_MULTIPLIER"],
      notes: "Added burst protection feature. Known issue: race condition in burst counter.",
    },
  },

  // ─── database-client ────────────────────────────────────
  {
    id: "db-pool-no-instance-scaling",
    service: "database-client",
    title: "Pool size calculation ignores instance count",
    description:
      "calculatePoolSize returns defaultPoolSize without dividing by instanceCount, so 20 instances * 25 pool = 500 connections exceeding DB limit.",
    filePath: "services/database-client/src/poolCalculator.ts",
    category: "configuration",
    severity: "high",
    difficulty: "easy",
    buggyCode: `  const perInstancePoolSize = config.defaultPoolSize;`,
    fixedCode: `  const availableConnections = config.maxDbConnections - config.reservedConnections;
  const perInstancePoolSize = Math.max(1, Math.floor(availableConnections / config.instanceCount));`,
    testFilePath: "services/database-client/tests/pool-scaling.test.ts",
    testCode: `import { describe, it, expect } from "vitest";
import { calculatePoolSize } from "../src/poolCalculator";

describe("pool scaling regression", () => {
  it("should reduce pool size when scaling to 20 instances", () => {
    const result = calculatePoolSize({
      maxDbConnections: 100,
      defaultPoolSize: 25,
      instanceCount: 20,
      reservedConnections: 5,
    });
    expect(result.withinLimit).toBe(true);
    expect(result.totalConnections).toBeLessThanOrEqual(100);
  });
});`,
    ticket: {
      title: "Database connection pool exhaustion during peak hours",
      description:
        "Every day between 09:00-11:00 PST we see 'too many connections' errors followed by request timeouts. This started 5 days ago after we scaled up to 20 application instances. We're using the default connection pool settings.",
      severity: "high",
      category: "performance",
      product: "database-client",
    },
    deployment: {
      service: "database-proxy",
      version: "pgbouncer-1.21.0",
      changedEnvVars: ["MAX_CLIENT_CONN", "DEFAULT_POOL_SIZE"],
      notes: "PgBouncer upgrade. DEFAULT_POOL_SIZE was NOT updated - still set to 25. Customer scaled to 20 instances.",
    },
  },
];
