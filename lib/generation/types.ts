export interface RealismConfig {
  misleadingLogs: boolean;
  noiseLevel: "none" | "low" | "medium" | "high";
  herringCount: number; // 0–3 red herrings to inject
}

export interface GenerationParams {
  mode: "wizard" | "autonomous" | "incident";
  count: number;
  products: string[];
  categories: string[];
  severityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  customerId?: string; // specific customer, or random if absent
  orgId: string;
  realism: RealismConfig;
  // for incident mode
  incidentScenario?: IncidentScenario;
}

export interface GeneratedTicketDraft {
  // Visible fields (go into Ticket table)
  title: string;
  description: string;
  category: string;
  product: string;
  severity: string;
  // Hidden ground truth (go into GeneratedTicketMeta)
  trueRootCause: string;
  trueCategory: string;
  trueSeverity: string;
  affectedProduct: string;
  injectedFaults: string[];
  difficulty: "easy" | "medium" | "hard";
  scenarioRole?: "trigger" | "symptom" | "related";
}

export interface IncidentScenario {
  name: string;
  description: string;
  products: string[];
  region: string;
  ticketCount: number;
  rootCause: string;
}

export interface TrainingScores {
  rootCauseScore: number;          // 0–1: did AI find the true root cause?
  severityScore: number;           // 0–1: did AI classify severity correctly?
  deceptionResistanceScore: number;// 0–1: did AI dismiss injected red herrings?
  overallScore: number;            // weighted average
  passed: boolean;                 // overall >= 0.7
  reasoning: string;
}

export interface TrainingScoreInput {
  ticketTitle: string;
  ticketDescription: string;
  trueRootCause: string;
  trueSeverity: string;
  injectedFaults: string[];
  difficulty: string;
  actualTopHypothesis: string;
  actualSeverityClassification: string;
  hypotheses: Array<{ title: string; confidence: number; evidence: string[] }>;
}
