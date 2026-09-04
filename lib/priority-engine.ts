// Priority Engine — deterministic scoring for work items
// Pure functions, no DB access

export interface PriorityContext {
  severity?: string; // critical | high | medium | low
  customerTier?: string; // enterprise | pro | free
  slaRemainingMinutes?: number;
  waitingDurationMinutes?: number;
  incidentSeverity?: string; // P0 | P1 | P2
  sentiment?: string; // frustrated | neutral | positive
  blockedParty?: string; // customer | internal | none
  manualBoost?: number; // -20 to +20
}

export interface PriorityBreakdown {
  severity: number;
  customerTier: number;
  slaProximity: number;
  waitingDuration: number;
  incidentImpact: number;
  sentiment: number;
  blockedParty: number;
  manualBoost: number;
}

export interface PriorityResult {
  score: number;
  band: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  breakdown: PriorityBreakdown;
}

const SEVERITY_SCORES: Record<string, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 15,
};

const TIER_SCORES: Record<string, number> = {
  enterprise: 100,
  pro: 60,
  free: 25,
};

const INCIDENT_SCORES: Record<string, number> = {
  P0: 100,
  P1: 70,
  P2: 35,
};

const SENTIMENT_SCORES: Record<string, number> = {
  frustrated: 100,
  neutral: 30,
  positive: 0,
};

const WEIGHTS = {
  severity: 0.2,
  customerTier: 0.15,
  slaProximity: 0.2,
  waitingDuration: 0.15,
  incidentImpact: 0.1,
  sentiment: 0.05,
  blockedParty: 0.1,
  manualBoost: 0.05,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreSlaProximity(remainingMinutes?: number): number {
  if (remainingMinutes === undefined) return 30;
  if (remainingMinutes <= 0) return 100;
  if (remainingMinutes <= 15) return 90;
  if (remainingMinutes <= 60) return 70;
  if (remainingMinutes <= 240) return 45;
  return 15;
}

function scoreWaitingDuration(waitingMinutes?: number): number {
  if (waitingMinutes === undefined) return 0;
  if (waitingMinutes >= 480) return 100;
  if (waitingMinutes >= 240) return 75;
  if (waitingMinutes >= 120) return 55;
  if (waitingMinutes >= 60) return 35;
  return 10;
}

function scoreBlockedParty(party?: string): number {
  if (party === "customer") return 100;
  if (party === "internal") return 50;
  return 0;
}

export function calculatePriority(context: PriorityContext): PriorityResult {
  const breakdown: PriorityBreakdown = {
    severity: SEVERITY_SCORES[context.severity ?? "medium"] ?? 40,
    customerTier: TIER_SCORES[context.customerTier ?? "free"] ?? 25,
    slaProximity: scoreSlaProximity(context.slaRemainingMinutes),
    waitingDuration: scoreWaitingDuration(context.waitingDurationMinutes),
    incidentImpact: INCIDENT_SCORES[context.incidentSeverity ?? ""] ?? 0,
    sentiment: SENTIMENT_SCORES[context.sentiment ?? "neutral"] ?? 30,
    blockedParty: scoreBlockedParty(context.blockedParty),
    manualBoost: clamp((context.manualBoost ?? 0) * 5, -100, 100),
  };

  const rawScore =
    breakdown.severity * WEIGHTS.severity +
    breakdown.customerTier * WEIGHTS.customerTier +
    breakdown.slaProximity * WEIGHTS.slaProximity +
    breakdown.waitingDuration * WEIGHTS.waitingDuration +
    breakdown.incidentImpact * WEIGHTS.incidentImpact +
    breakdown.sentiment * WEIGHTS.sentiment +
    breakdown.blockedParty * WEIGHTS.blockedParty +
    breakdown.manualBoost * WEIGHTS.manualBoost;

  const score = clamp(Math.round(rawScore * 10) / 10, 0, 100);

  return {
    score,
    band: scoreToBand(score),
    breakdown,
  };
}

export function scoreToBand(score: number): "URGENT" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 80) return "URGENT";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export function explainPriority(breakdown: PriorityBreakdown): string {
  const parts: string[] = [];
  if (breakdown.severity >= 70) parts.push(`severity +${Math.round(breakdown.severity * WEIGHTS.severity)}`);
  if (breakdown.customerTier >= 60) parts.push(`enterprise/pro customer +${Math.round(breakdown.customerTier * WEIGHTS.customerTier)}`);
  if (breakdown.slaProximity >= 70) parts.push(`SLA at risk +${Math.round(breakdown.slaProximity * WEIGHTS.slaProximity)}`);
  if (breakdown.waitingDuration >= 55) parts.push(`long wait +${Math.round(breakdown.waitingDuration * WEIGHTS.waitingDuration)}`);
  if (breakdown.incidentImpact > 0) parts.push(`incident +${Math.round(breakdown.incidentImpact * WEIGHTS.incidentImpact)}`);
  if (breakdown.blockedParty >= 50) parts.push(`blocked +${Math.round(breakdown.blockedParty * WEIGHTS.blockedParty)}`);
  if (breakdown.manualBoost !== 0) parts.push(`manual ${breakdown.manualBoost > 0 ? "+" : ""}${Math.round(breakdown.manualBoost * WEIGHTS.manualBoost)}`);

  const total = Math.round(
    breakdown.severity * WEIGHTS.severity +
    breakdown.customerTier * WEIGHTS.customerTier +
    breakdown.slaProximity * WEIGHTS.slaProximity +
    breakdown.waitingDuration * WEIGHTS.waitingDuration +
    breakdown.incidentImpact * WEIGHTS.incidentImpact +
    breakdown.sentiment * WEIGHTS.sentiment +
    breakdown.blockedParty * WEIGHTS.blockedParty +
    breakdown.manualBoost * WEIGHTS.manualBoost
  );

  return `${total}/100: ${parts.join(", ")}`;
}
