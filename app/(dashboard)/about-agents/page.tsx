import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Inbox, UserCircle, ScrollText, BookOpen, AlertTriangle,
  GitBranch, BrainCircuit, MessageSquare, Shield, Megaphone, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AgentInfo {
  name: string;
  label: string;
  icon: LucideIcon;
  model: string;
  parallel?: boolean;
  description: string;
  howItHelps: string;
  inputs: string[];
  outputs: string[];
}

const agents: AgentInfo[] = [
  {
    name: "intake",
    label: "Ticket Classification",
    icon: Inbox,
    model: "gpt-4o-mini",
    description:
      "The first agent in the pipeline. It reads the raw ticket and classifies it by category (e.g., API, billing, authentication), severity level, and affected product or service. It also produces a structured summary of the customer's reported symptoms.",
    howItHelps:
      "Fast, accurate classification ensures the right downstream agents focus on the right problem. By identifying the affected product early, log analysis and knowledge retrieval can target relevant sources instead of searching everything.",
    inputs: ["Ticket title", "Ticket description", "Customer metadata"],
    outputs: ["Category", "Severity", "Affected product", "Structured summary"],
  },
  {
    name: "customer-context",
    label: "Customer Context",
    icon: UserCircle,
    model: "gpt-4o-mini",
    description:
      "Enriches the investigation with customer context — their subscription plan, region, account age, company size, and any recent ticket history. This agent looks at the full customer profile to understand the business impact.",
    howItHelps:
      "Enterprise customers on critical plans get different handling than free-tier users. Knowing the customer's region helps correlate with region-specific outages, and recent ticket history reveals patterns of recurring issues.",
    inputs: ["Customer ID", "Customer profile from database"],
    outputs: ["Customer tier", "Region", "Account context", "Recent ticket history"],
  },
  {
    name: "log-analysis",
    label: "Log Analysis",
    icon: ScrollText,
    model: "gpt-4o-mini",
    parallel: true,
    description:
      "Searches application logs (via Datadog integration or mock data) for error patterns, stack traces, and anomalies related to the ticket's timeframe and affected service. It filters and ranks log entries by relevance.",
    howItHelps:
      "Logs provide the ground truth of what actually happened. This agent surfaces the specific errors, timeouts, and exceptions that correlate with the customer's report — turning vague symptoms into concrete technical evidence.",
    inputs: ["Affected service", "Timeframe", "Ticket symptoms"],
    outputs: ["Relevant log entries", "Error patterns", "Service health indicators"],
  },
  {
    name: "knowledge-retrieval",
    label: "Knowledge Retrieval",
    icon: BookOpen,
    model: "gpt-4o-mini",
    parallel: true,
    description:
      "Performs RAG (Retrieval-Augmented Generation) search against the embedded knowledge base using pgvector. Retrieves the most relevant documentation chunks, then optionally reranks them using a HuggingFace cross-encoder for higher precision.",
    howItHelps:
      "Connects the customer's issue to existing documentation — known bugs, configuration guides, troubleshooting runbooks, and release notes. This prevents the AI from hallucinating solutions and ensures responses are grounded in real documentation.",
    inputs: ["Ticket summary", "Classification"],
    outputs: ["Top-ranked knowledge chunks with source paths", "Reranker confidence scores"],
  },
  {
    name: "incident-correlation",
    label: "Incident Correlation",
    icon: AlertTriangle,
    model: "gpt-4o-mini",
    parallel: true,
    description:
      "Checks for active or recent incidents (via Sentry integration or internal incident records) that match the ticket's symptoms, affected product, and timeframe. It looks for patterns across multiple tickets that suggest a systemic issue.",
    howItHelps:
      "If 10 customers report the same error, they shouldn't get 10 separate investigations. This agent detects when a ticket is part of a larger incident, enabling faster resolution and accurate customer communication about known issues.",
    inputs: ["Affected product", "Symptoms", "Timeframe", "Customer region"],
    outputs: ["Correlated incidents", "Severity assessment", "Customer impact scope"],
  },
  {
    name: "deployment-correlation",
    label: "Deployment Correlation",
    icon: GitBranch,
    model: "gpt-4o-mini",
    parallel: true,
    description:
      "Examines recent deployments to the affected service — checking deploy times, authors, and change descriptions to identify if a recent release may have introduced the issue.",
    howItHelps:
      "Many production issues are caused by recent deployments. By correlating the ticket's start time with deploy history, this agent can quickly identify \"it worked before the 2pm deploy\" scenarios and point to the specific change.",
    inputs: ["Affected service", "Issue start time"],
    outputs: ["Recent deployments", "Suspect deploys with timing correlation"],
  },
  {
    name: "root-cause",
    label: "Root Cause Analysis",
    icon: BrainCircuit,
    model: "gpt-4o",
    description:
      "The core reasoning agent. It synthesizes all evidence from the parallel agents — logs, knowledge base matches, incidents, and deployments — to form ranked hypotheses about the root cause. Each hypothesis includes confidence scores, supporting evidence, and a recommended action.",
    howItHelps:
      "This is where the investigation comes together. Instead of dumping raw data on a support engineer, it produces structured hypotheses like \"85% confidence: Database connection pool exhaustion caused by the v2.3.1 deploy\" with specific evidence citations.",
    inputs: ["All outputs from parallel agents", "Customer context", "Classification"],
    outputs: ["Ranked hypotheses with confidence scores", "Evidence chains", "Recommended actions"],
  },
  {
    name: "response-drafting",
    label: "Response Drafting",
    icon: MessageSquare,
    model: "gpt-4o",
    description:
      "Drafts a customer-facing response based on the root cause analysis. It translates technical findings into clear, empathetic communication appropriate for the customer's technical level and plan tier.",
    howItHelps:
      "Support engineers spend significant time crafting responses. This agent produces a ready-to-review draft that explains the issue, what's being done about it, and sets appropriate expectations — while matching the tone and detail level to the customer.",
    inputs: ["Hypotheses", "Customer context", "Knowledge base evidence"],
    outputs: ["Draft customer reply", "Internal summary"],
  },
  {
    name: "guardrails",
    label: "Guardrails Check",
    icon: Shield,
    model: "gpt-4o-mini",
    description:
      "A safety layer that checks the drafted response for policy violations before it reaches human review. It scans for leaked PII (emails, phone numbers, API keys), hallucinated information not supported by evidence, inappropriate promises, and tone issues.",
    howItHelps:
      "Prevents embarrassing or dangerous mistakes from reaching customers. Even if the AI draft is mostly good, guardrails catch edge cases like accidentally including another customer's data or promising a fix timeline the team can't meet.",
    inputs: ["Draft response", "Hypotheses", "Knowledge evidence"],
    outputs: ["Pass/fail verdict", "Flagged issues with severity", "Suggested corrections"],
  },
  {
    name: "escalation",
    label: "Escalation Note",
    icon: Megaphone,
    model: "gpt-4o",
    description:
      "Generates a structured internal escalation note for the engineering team. It includes the technical root cause analysis, affected systems, reproduction steps, and priority recommendation — formatted for engineering consumption rather than customer communication.",
    howItHelps:
      "When an issue needs engineering attention, this agent creates a handoff document that engineers can act on immediately. It bridges the gap between support and engineering by translating customer symptoms into technical action items.",
    inputs: ["Hypotheses", "Log evidence", "Deployment correlation", "Incident data"],
    outputs: ["Structured escalation note", "Priority recommendation", "Affected systems list"],
  },
];

export default async function AboutAgentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          About the Investigation Agents
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          The Support Buddy uses a pipeline of 10 specialized AI agents to investigate support tickets.
          Each agent handles one aspect of the analysis, and their outputs feed into the next stage.
        </p>
      </div>

      {/* Pipeline overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {agents.map((agent, i) => (
              <span key={agent.name} className="flex items-center gap-1">
                {agent.parallel && i > 0 && !agents[i - 1].parallel && (
                  <span className="text-slate-400 mx-1">┤</span>
                )}
                <Badge
                  variant="outline"
                  className={`${
                    agent.model === "gpt-4o"
                      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                      : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  {agent.label}
                </Badge>
                {agent.parallel && i < agents.length - 1 && !agents[i + 1].parallel && (
                  <span className="text-slate-400 mx-1">├</span>
                )}
                {!agent.parallel && i < agents.length - 1 && !agents[i + 1]?.parallel && (
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                )}
              </span>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-200 dark:bg-blue-800" />
              gpt-4o (reasoning)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" />
              gpt-4o-mini (classification/retrieval)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Agent cards */}
      <div className="space-y-4">
        {agents.map((agent, i) => {
          const Icon = agent.icon;
          return (
            <Card key={agent.name} id={agent.name}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-500">
                    {i + 1}
                  </span>
                  <Icon className="w-5 h-5 text-slate-500" />
                  {agent.label}
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {agent.model}
                  </Badge>
                  {agent.parallel && (
                    <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
                      parallel
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {agent.description}
                </p>

                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                    How this helps troubleshoot
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                    {agent.howItHelps}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Inputs</p>
                    <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      {agent.inputs.map((input) => (
                        <li key={input} className="flex items-start gap-1">
                          <span className="text-slate-300 dark:text-slate-600 mt-0.5">›</span>
                          {input}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Outputs</p>
                    <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      {agent.outputs.map((output) => (
                        <li key={output} className="flex items-start gap-1">
                          <span className="text-slate-300 dark:text-slate-600 mt-0.5">›</span>
                          {output}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
