import type { Ticket, Customer } from "@prisma/client";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  customerId: string;
  message: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  service: string;
  operation: string;
  startTime: string;
  duration: number;
  status: string;
  tags?: Record<string, unknown>;
}

// Renamed from Incident to avoid conflict with the Prisma Incident model (Phase 6)
export interface CorrelatedIncident {
  id: string;
  title: string;
  status: string;
  severity: string;
  affectedProducts: string[];
  affectedRegions: string[];
  startTime: string;
  endTime: string | null;
  rootCause: string;
  resolution: string;
  customerImpact: string;
}

export interface Deployment {
  id: string;
  service: string;
  version: string;
  timestamp: string;
  author: string;
  environment: string;
  region: string;
  status: string;
  changedEnvVars: string[];
  notes: string;
}

export interface Hypothesis {
  id: string;
  title: string;
  description: string;
  confidence: number; // 0-100
  evidence: string[];
  recommendedAction: string;
  affectedService?: string;
}

// Phase 4 + 6: EvidenceChunk with reranking and [KB-N] citation metadata
export interface KnowledgeChunk {
  id: string;
  sourcePath: string;
  chunkIndex: number;
  content: string;
  similarity?: number;
  rerankScore?: number;    // HuggingFace cross-encoder score
  citedBy?: string[];      // agent names that referenced this chunk
  // Phase 6 RAG fields
  documentId?: string | null;
  documentTitle?: string;
  sourceType?: string;     // RUNBOOK | SUPPORT_TICKET | INCIDENT_REPORT | etc.
  citationLabel?: string;  // "[KB-1]"
}

// Phase 2: Guardrails types
export interface GuardrailFlag {
  type: "pii" | "secret" | "low_confidence" | "unsupported_claim" | "internal_leak";
  severity: "warn" | "block";
  description: string;
  location: string;
}

export interface GuardrailsResult {
  passed: boolean;
  flags: GuardrailFlag[];
  revisedDraft?: string;
}

export interface InvestigationState {
  ticketId: string;
  runId: string;
  ticket: Ticket & { customer: Customer };
  customer: Customer;
  classification: {
    category: string;
    severity: string;
    affectedProduct: string;
    summary: string;
  } | null;
  logs: LogEntry[];
  traces: TraceSpan[];
  knowledgeChunks: KnowledgeChunk[];
  incidents: CorrelatedIncident[];
  deployments: Deployment[];
  hypotheses: Hypothesis[];
  draftReply: string;
  escalationNote: string;
  guardrailsResult: GuardrailsResult | null; // Phase 2
  urgencyScore: number | null; // HF sentiment score — 0 (calm) to 1 (urgent/negative)
  evalModel?: string; // model override for eval runs (e.g. "gpt-4o-mini" vs "gpt-4o")
}
