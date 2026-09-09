export interface BugTemplate {
  id: string;
  service: string;
  title: string;
  description: string;
  filePath: string;
  category: "authentication" | "data" | "integration" | "performance" | "configuration";
  severity: "critical" | "high" | "medium" | "low";
  difficulty: "easy" | "medium" | "hard";
  /** The buggy code to inject (replaces the fix marker in the source file) */
  buggyCode: string;
  /** The correct code (what a fix looks like) */
  fixedCode: string;
  /** Test file that will fail when the bug is present */
  testFilePath: string;
  /** Test code to write — should fail with buggy code, pass with fixed code */
  testCode: string;
  /** Ticket fields for auto-creating a Support Buddy ticket */
  ticket: {
    title: string;
    description: string;
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    product: string;
  };
  /** Deployment record fields */
  deployment?: {
    service: string;
    version: string;
    changedEnvVars: string[];
    notes: string;
  };
}

export interface GeneratedBug {
  templateId: string;
  service: string;
  filePath: string;
  testFilePath: string;
  ticketId?: string;
  generatedAt: string;
}

export interface BugGenerationResult {
  success: boolean;
  bug: GeneratedBug;
  ticketId?: string;
  error?: string;
}
