import { Annotation, StateGraph, END } from "@langchain/langgraph";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { fetchTicketWithCustomer } from "./tools/ticket-tool";
import { intakeAgent } from "./nodes/intake-agent";
import { customerContextAgent } from "./nodes/customer-context-agent";
import { logAnalysisAgent } from "./nodes/log-analysis-agent";
import { knowledgeAgent } from "./nodes/knowledge-agent";
import { incidentCorrelationAgent } from "./nodes/incident-correlation-agent";
import { deploymentCorrelationAgent } from "./nodes/deployment-correlation-agent";
import { rootCauseAgent } from "./nodes/root-cause-agent";
import { responseAgent } from "./nodes/response-agent";
import { guardrailsAgent } from "./nodes/guardrails-agent";
import { escalationAgent } from "./nodes/escalation-agent";
import type { InvestigationState } from "./state";

const logger = createLogger("graph");

// Use Annotation API for LangGraph state definition
const InvestigationStateAnnotation = Annotation.Root({
  ticketId: Annotation<string>({ reducer: (_, b) => b }),
  runId: Annotation<string>({ reducer: (_, b) => b }),
  ticket: Annotation<InvestigationState["ticket"] | null>({ reducer: (_, b) => b, default: () => null }),
  customer: Annotation<InvestigationState["customer"] | null>({ reducer: (_, b) => b, default: () => null }),
  classification: Annotation<InvestigationState["classification"] | null>({ reducer: (_, b) => b, default: () => null }),
  logs: Annotation<InvestigationState["logs"]>({ reducer: (_, b) => b, default: () => [] }),
  traces: Annotation<InvestigationState["traces"]>({ reducer: (_, b) => b, default: () => [] }),
  knowledgeChunks: Annotation<InvestigationState["knowledgeChunks"]>({ reducer: (_, b) => b, default: () => [] }),
  incidents: Annotation<InvestigationState["incidents"]>({ reducer: (_, b) => b, default: () => [] }),
  deployments: Annotation<InvestigationState["deployments"]>({ reducer: (_, b) => b, default: () => [] }),
  hypotheses: Annotation<InvestigationState["hypotheses"]>({ reducer: (_, b) => b, default: () => [] }),
  draftReply: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  escalationNote: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  guardrailsResult: Annotation<InvestigationState["guardrailsResult"]>({ reducer: (_, b) => b, default: () => null }), // Phase 2
  urgencyScore: Annotation<number | null>({ reducer: (_, b) => b, default: () => null }),
  evalModel: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});

type GraphState = typeof InvestigationStateAnnotation.State;

// Parallel fan-out node
async function parallelAnalysis(state: GraphState): Promise<Partial<GraphState>> {
  const [logResult, knowledgeResult, incidentResult, deploymentResult] = await Promise.all([
    logAnalysisAgent(state as unknown as InvestigationState),
    knowledgeAgent(state as unknown as InvestigationState),
    incidentCorrelationAgent(state as unknown as InvestigationState),
    deploymentCorrelationAgent(state as unknown as InvestigationState),
  ]);

  return {
    ...logResult,
    ...knowledgeResult,
    ...incidentResult,
    ...deploymentResult,
  } as Partial<GraphState>;
}

export async function runInvestigation(ticketId: string, runId: string, evalModel?: string): Promise<void> {
  logger.info("Starting investigation", { ticketId, runId });

  await prisma.investigationRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  try {
    const ticket = await fetchTicketWithCustomer(ticketId);

    const graph = new StateGraph(InvestigationStateAnnotation)
      .addNode("intake", (s: GraphState) => intakeAgent(s as unknown as InvestigationState) as Promise<Partial<GraphState>>)
      .addNode("customer_context", (s: GraphState) => customerContextAgent(s as unknown as InvestigationState) as Promise<Partial<GraphState>>)
      .addNode("parallel_analysis", parallelAnalysis)
      .addNode("root_cause", (s: GraphState) => rootCauseAgent(s as unknown as InvestigationState) as Promise<Partial<GraphState>>)
      .addNode("response_drafting", (s: GraphState) => responseAgent(s as unknown as InvestigationState) as Promise<Partial<GraphState>>)
      .addNode("guardrails", (s: GraphState) => guardrailsAgent(s as unknown as InvestigationState) as Promise<Partial<GraphState>>) // Phase 2
      .addNode("escalation", (s: GraphState) => escalationAgent(s as unknown as InvestigationState) as Promise<Partial<GraphState>>)
      .addEdge("__start__", "intake")
      .addEdge("intake", "customer_context")
      .addEdge("customer_context", "parallel_analysis")
      .addEdge("parallel_analysis", "root_cause")
      .addEdge("root_cause", "response_drafting")
      .addEdge("response_drafting", "guardrails") // Phase 2
      .addEdge("guardrails", "escalation")
      .addEdge("escalation", END);

    const app = graph.compile();

    await app.invoke({
      ticketId,
      runId,
      ticket,
      customer: ticket.customer,
      evalModel,
    });

    logger.info("Investigation graph complete", { ticketId, runId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Investigation failed", { ticketId, runId, error: msg });

    await prisma.investigationRun.update({
      where: { id: runId },
      data: { status: "failed", completedAt: new Date(), errorMessage: msg },
    });

    throw error;
  }
}
