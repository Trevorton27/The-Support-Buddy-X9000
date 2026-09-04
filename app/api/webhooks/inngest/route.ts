import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  runInvestigationFunction,
  clusterTicketsFunction,
  batchGenerateTicketsFunction,
  processWorkSignalFunction,
  recalculatePrioritiesFunction,
  refreshAgentContextFunction,
  activateScheduledFollowupsFunction,
  generateShiftBriefingFunction,
  detectStaleResponsibilitiesFunction,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    runInvestigationFunction,
    clusterTicketsFunction,
    batchGenerateTicketsFunction,
    processWorkSignalFunction,
    recalculatePrioritiesFunction,
    refreshAgentContextFunction,
    activateScheduledFollowupsFunction,
    generateShiftBriefingFunction,
    detectStaleResponsibilitiesFunction,
  ],
});
