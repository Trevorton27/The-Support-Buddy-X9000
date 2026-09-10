import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  runInvestigationFunction,
  clusterTicketsFunction,
  syncTicketToGitHubFunction,
  batchGenerateTicketsFunction,
  processWorkSignalFunction,
  recalculatePrioritiesFunction,
  refreshAgentContextFunction,
  activateScheduledFollowupsFunction,
  generateShiftBriefingFunction,
  detectStaleResponsibilitiesFunction,
  pollDevinTaskFunction,
  runDemoScenarioFunction,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runInvestigationFunction,
    clusterTicketsFunction,
    syncTicketToGitHubFunction,
    batchGenerateTicketsFunction,
    processWorkSignalFunction,
    recalculatePrioritiesFunction,
    refreshAgentContextFunction,
    activateScheduledFollowupsFunction,
    generateShiftBriefingFunction,
    detectStaleResponsibilitiesFunction,
    pollDevinTaskFunction,
    runDemoScenarioFunction,
  ],
});
