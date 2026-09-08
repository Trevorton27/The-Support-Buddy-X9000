import type { DevinSession, ReproductionVerdict, FixVerdict } from "./types";
import { devinStructuredResultSchema } from "./types";

export interface ParsedDevinResult {
  verdict: string;
  verdictReason: string;
  pullRequestUrl?: string;
  reproductionSteps?: string[];
  confirmedHypotheses?: string[];
  rejectedHypotheses?: string[];
  changedFiles?: string[];
  branch?: string;
  testResults?: string;
  residualRisks?: string[];
  blockers?: string[];
  requiredHumanAction?: string;
}

const REPRODUCTION_VERDICTS: ReproductionVerdict[] = [
  "REPRODUCED",
  "UNABLE_TO_REPRODUCE",
  "CONFIGURATION_ISSUE",
  "PRODUCT_DEFECT",
  "DOCUMENTATION_DEFECT",
  "ADDITIONAL_INFORMATION_REQUIRED",
];

const FIX_VERDICTS: FixVerdict[] = ["FIX_SUBMITTED", "FIX_FAILED"];

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function scanMessagesForVerdict(messages: Array<{ content: string }>, mode: "reproduce" | "fix"): string | null {
  const validVerdicts = mode === "reproduce" ? REPRODUCTION_VERDICTS : FIX_VERDICTS;
  const lastMessages = messages.slice(-5);

  for (const msg of lastMessages.reverse()) {
    for (const verdict of validVerdicts) {
      if (msg.content.includes(verdict)) {
        return verdict;
      }
    }
  }
  return null;
}

export function parseDevinResult(
  session: DevinSession,
  mode: "reproduce" | "fix"
): ParsedDevinResult {
  // Try structured output first
  if (session.structured_output) {
    const parsed = devinStructuredResultSchema.safeParse(session.structured_output);
    if (parsed.success) {
      const prUrl = session.pull_request?.url;
      return {
        verdict: parsed.data.verdict,
        verdictReason: parsed.data.verdictReason ?? "",
        pullRequestUrl: prUrl && isValidUrl(prUrl) ? prUrl : undefined,
        reproductionSteps: parsed.data.reproductionSteps,
        confirmedHypotheses: parsed.data.confirmedHypotheses,
        rejectedHypotheses: parsed.data.rejectedHypotheses,
        changedFiles: parsed.data.changedFiles,
        branch: parsed.data.branch,
        testResults: parsed.data.testResults,
        residualRisks: parsed.data.residualRisks,
        blockers: parsed.data.blockers,
        requiredHumanAction: parsed.data.requiredHumanAction,
      };
    }
  }

  // Fallback: scan messages for verdict keywords
  const messageVerdict = scanMessagesForVerdict(session.messages ?? [], mode);
  if (messageVerdict) {
    const prUrl = session.pull_request?.url;
    return {
      verdict: messageVerdict,
      verdictReason: "Verdict extracted from session messages (no structured output)",
      pullRequestUrl: prUrl && isValidUrl(prUrl) ? prUrl : undefined,
    };
  }

  // Final fallback: map from session status
  if (session.status_enum === "expired") {
    return {
      verdict: mode === "reproduce" ? "ADDITIONAL_INFORMATION_REQUIRED" : "FIX_FAILED",
      verdictReason: "Devin session expired before completing the task",
    };
  }

  if (session.status_enum === "finished") {
    // Finished but no recognizable verdict
    const prUrl = session.pull_request?.url;
    if (mode === "fix" && prUrl && isValidUrl(prUrl)) {
      return {
        verdict: "FIX_SUBMITTED",
        verdictReason: "Session finished with PR but no structured output",
        pullRequestUrl: prUrl,
      };
    }
    return {
      verdict: "ADDITIONAL_INFORMATION_REQUIRED",
      verdictReason: "Session finished but output could not be parsed. Manual review required.",
    };
  }

  // Blocked or unknown
  return {
    verdict: "ADDITIONAL_INFORMATION_REQUIRED",
    verdictReason: `Session in unexpected state: ${session.status_enum}. Manual review required.`,
  };
}
