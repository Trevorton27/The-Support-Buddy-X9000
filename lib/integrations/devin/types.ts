import { z } from "zod";
import type { IIntegrationAdapter } from "../types";

// Devin API status_enum values
export type DevinSessionStatus =
  | "working"
  | "blocked"
  | "expired"
  | "finished"
  | "suspend_requested"
  | "suspend_requested_frontend"
  | "resume_requested"
  | "resume_requested_frontend"
  | "resumed";

// Internal normalized statuses for DevinTask.status
export type DevinInternalStatus =
  | "queued"
  | "creating"
  | "working"
  | "blocked"
  | "waiting"
  | "pr_ready"
  | "finished"
  | "failed"
  | "expired"
  | "cancelled";

export interface DevinMessage {
  type: string;        // "initial_user_message" | "user_message" | "devin_message" | etc.
  message: string;
  timestamp?: string;
  username?: string | null;
  event_id?: string;
  origin?: string | null;
  user_id?: string | null;
}

export interface DevinSession {
  session_id: string;
  status_enum: string;
  title?: string;
  messages: DevinMessage[];
  structured_output?: Record<string, unknown>;
  pull_request?: { url: string };
  tags: string[];
  created_at: string;
  updated_at: string;
  url?: string;
}

export interface DevinCreateSessionRequest {
  prompt: string;
}

export interface DevinCreateSessionResponse {
  session_id: string;
  url: string;
}

export type ReproductionVerdict =
  | "REPRODUCED"
  | "UNABLE_TO_REPRODUCE"
  | "CONFIGURATION_ISSUE"
  | "PRODUCT_DEFECT"
  | "DOCUMENTATION_DEFECT"
  | "ADDITIONAL_INFORMATION_REQUIRED";

export type FixVerdict = "FIX_SUBMITTED" | "FIX_FAILED";

export const devinStructuredResultSchema = z.object({
  verdict: z.string(),
  verdictReason: z.string().optional(),
  reproductionSteps: z.array(z.string()).optional(),
  confirmedHypotheses: z.array(z.string()).optional(),
  rejectedHypotheses: z.array(z.string()).optional(),
  changedFiles: z.array(z.string()).optional(),
  branch: z.string().optional(),
  testResults: z.string().optional(),
  residualRisks: z.array(z.string()).optional(),
  blockers: z.array(z.string()).optional(),
  requiredHumanAction: z.string().optional(),
});

export type DevinStructuredResult = z.infer<typeof devinStructuredResultSchema>;

export interface IDevinAdapter extends IIntegrationAdapter {
  createSession(req: DevinCreateSessionRequest): Promise<DevinCreateSessionResponse>;
  getSession(sessionId: string): Promise<DevinSession>;
  sendMessage(sessionId: string, message: string): Promise<void>;
}

export function mapDevinStatusToInternal(
  statusEnum: string,
  session: DevinSession
): DevinInternalStatus {
  // Check for PR before status mapping
  if (session.pull_request?.url && statusEnum === "finished") {
    return "finished";
  }
  if (session.pull_request?.url && statusEnum === "working") {
    return "pr_ready";
  }

  switch (statusEnum) {
    case "working":
    case "resumed":
    case "resume_requested":
    case "resume_requested_frontend":
      return "working";
    case "blocked":
      return "blocked";
    case "suspend_requested":
    case "suspend_requested_frontend":
      return "waiting";
    case "finished":
      return "finished";
    case "expired":
      return "expired";
    default:
      return "working";
  }
}

export const TERMINAL_STATUSES: DevinInternalStatus[] = [
  "finished",
  "failed",
  "expired",
  "cancelled",
];
