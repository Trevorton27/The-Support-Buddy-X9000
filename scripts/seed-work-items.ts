import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_AGENT_1 = "user_demo_agent_001";
const DEMO_AGENT_2 = "user_demo_agent_002";

async function main() {
  console.log("Seeding work items...");

  // Get existing tickets and investigations to link to
  const tickets = await prisma.ticket.findMany({ take: 6, orderBy: { createdAt: "asc" } });
  const investigations = await prisma.investigationRun.findMany({ take: 3, orderBy: { startedAt: "asc" } });
  const incidents = await prisma.incident.findMany({ take: 2, orderBy: { createdAt: "asc" } });

  if (tickets.length === 0) {
    console.log("  No tickets found — run `npm run seed` first");
    process.exit(1);
  }

  const orgId = tickets[0].orgId || "";

  // Create TicketMessages for first 3 tickets
  console.log("  Creating ticket messages...");
  for (const ticket of tickets.slice(0, 3)) {
    await prisma.ticketMessage.createMany({
      data: [
        {
          ticketId: ticket.id,
          content: `Hi, I'm experiencing an issue: ${ticket.title}. Can you help?`,
          authorType: "customer",
          authorName: "Customer",
          channel: "web",
        },
        {
          ticketId: ticket.id,
          content: "Thank you for reaching out. We're looking into this now.",
          authorType: "agent",
          authorId: DEMO_AGENT_1,
          authorName: "Support Agent",
          channel: "web",
        },
        {
          ticketId: ticket.id,
          content: "Investigation started automatically.",
          authorType: "system",
          channel: "web",
        },
      ],
    });
  }

  // Create WorkItems
  console.log("  Creating work items...");
  const workItemsData = [
    // 1. Critical customer reply
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "CUSTOMER_REPLY",
      status: "OPEN",
      title: "Urgent: Customer reply needed — production outage",
      summary: "Enterprise customer reporting complete production outage affecting all users.",
      requiredAction: "Reply with status update and ETA",
      priorityScore: 92,
      priorityBand: "URGENT",
      ticketId: tickets[0]?.id,
      confidence: 0.95,
      sourceType: "ticket",
      sourceId: tickets[0]?.id,
    },
    // 2. Engineering-blocked escalation
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "ESCALATION",
      status: "WAITING_INTERNAL",
      title: "Escalation: Database migration failure",
      summary: "Customer's database migration failed mid-way. Needs engineering team to investigate.",
      requiredAction: "Follow up with engineering team",
      waitingOn: "Engineering team — @dave investigating",
      priorityScore: 78,
      priorityBand: "HIGH",
      ticketId: tickets[1]?.id,
      confidence: 0.88,
    },
    // 3. Pending approval
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "APPROVAL",
      status: "OPEN",
      title: "Review investigation: API rate limiting issue",
      summary: "Investigation complete. Draft response ready for review.",
      requiredAction: "Review and approve/reject the drafted response",
      priorityScore: 65,
      priorityBand: "HIGH",
      investigationRunId: investigations[0]?.id,
      ticketId: tickets[2]?.id,
      confidence: 0.92,
    },
    // 4. Customer follow-up
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "CUSTOMER_REPLY",
      status: "WAITING_CUSTOMER",
      title: "Follow up: SSL certificate renewal",
      summary: "Asked customer for their domain configuration details. Waiting for response.",
      waitingOn: "Customer — requested domain config",
      priorityScore: 45,
      priorityBand: "MEDIUM",
      ticketId: tickets[3]?.id,
      confidence: 0.85,
    },
    // 5. P1 Incident
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "INCIDENT_UPDATE",
      status: "IN_PROGRESS",
      title: "P1: Authentication service degraded",
      summary: "Multiple customers reporting login failures. Incident created with 5 related tickets.",
      requiredAction: "Update status page and coordinate with on-call",
      priorityScore: 88,
      priorityBand: "URGENT",
      incidentId: incidents[0]?.id,
      confidence: 0.97,
    },
    // 6. Snoozed low-priority
    {
      orgId,
      assigneeId: DEMO_AGENT_2,
      type: "DOCUMENTATION",
      status: "SNOOZED",
      title: "Update runbook: Redis failover procedure",
      summary: "Runbook needs updating after infrastructure changes last week.",
      priorityScore: 18,
      priorityBand: "LOW",
      snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      confidence: 0.7,
    },
    // 7. Needs classification
    {
      orgId,
      assigneeId: DEMO_AGENT_2,
      type: "MANUAL_TASK",
      status: "NEEDS_CLASSIFICATION",
      title: "Unclassified: Incoming webhook payload",
      summary: "Received webhook from unknown integration. Needs manual review.",
      priorityScore: 35,
      priorityBand: "MEDIUM",
      confidence: 0.3,
      sourceType: "webhook",
    },
    // 8. Recently completed
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "CUSTOMER_REPLY",
      status: "COMPLETED",
      title: "Resolved: Password reset not working",
      summary: "Customer's password reset was failing due to expired token. Fixed and confirmed.",
      priorityScore: 55,
      priorityBand: "MEDIUM",
      ticketId: tickets[4]?.id,
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      confidence: 0.99,
    },
    // 9. Internal follow-up
    {
      orgId,
      assigneeId: DEMO_AGENT_2,
      type: "INTERNAL_FOLLOW_UP",
      status: "OPEN",
      title: "Review: Duplicate ticket consolidation",
      summary: "3 tickets appear to be duplicates. Review and merge.",
      requiredAction: "Verify duplicates and merge tickets",
      priorityScore: 42,
      priorityBand: "MEDIUM",
      confidence: 0.75,
    },
    // 10. Investigation work item
    {
      orgId,
      assigneeId: DEMO_AGENT_2,
      type: "INVESTIGATION",
      status: "IN_PROGRESS",
      title: "Investigate: Webhook delivery failures",
      summary: "Multiple webhook deliveries failing for customer's endpoint.",
      requiredAction: "Check webhook logs and endpoint health",
      priorityScore: 62,
      priorityBand: "HIGH",
      ticketId: tickets[5]?.id,
      investigationRunId: investigations[1]?.id,
      confidence: 0.82,
    },
    // 11. Scheduled check
    {
      orgId,
      assigneeId: DEMO_AGENT_1,
      type: "SCHEDULED_CHECK",
      status: "OPEN",
      title: "Check: Post-deploy health verification",
      summary: "Verify service health after v2.3.1 deployment completed 1 hour ago.",
      requiredAction: "Run health checks and verify metrics",
      priorityScore: 50,
      priorityBand: "MEDIUM",
      dueAt: new Date(Date.now() + 30 * 60 * 1000),
      confidence: 0.9,
    },
    // 12. Second incident update
    {
      orgId,
      assigneeId: DEMO_AGENT_2,
      type: "INCIDENT_UPDATE",
      status: "OPEN",
      title: "P2: Elevated error rates in EU region",
      summary: "Error rates above threshold in eu-west-1. Monitoring required.",
      requiredAction: "Monitor dashboards and prepare comms if escalation needed",
      priorityScore: 55,
      priorityBand: "MEDIUM",
      incidentId: incidents[1]?.id,
      confidence: 0.85,
    },
  ];

  const createdWorkItems = [];
  for (const data of workItemsData) {
    // Filter out undefined FK values
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) cleanData[key] = value;
    }
    const workItem = await prisma.workItem.create({ data: cleanData as Parameters<typeof prisma.workItem.create>[0]["data"] });
    createdWorkItems.push(workItem);

    // Create initial event
    await prisma.workItemEvent.create({
      data: {
        workItemId: workItem.id,
        eventType: "created",
        actorType: "system",
        newValue: JSON.parse(JSON.stringify({
          type: workItem.type,
          status: workItem.status,
          priorityScore: workItem.priorityScore,
        })),
      },
    });
  }

  // Add lifecycle events to some items
  console.log("  Creating work item events...");
  const escalationItem = createdWorkItems[1]; // Engineering-blocked
  if (escalationItem) {
    await prisma.workItemEvent.create({
      data: {
        workItemId: escalationItem.id,
        eventType: "assigned",
        actorId: DEMO_AGENT_1,
        actorType: "user",
        newValue: JSON.parse(JSON.stringify({ assigneeId: DEMO_AGENT_1 })),
      },
    });
    await prisma.workItemEvent.create({
      data: {
        workItemId: escalationItem.id,
        eventType: "waiting_set",
        actorId: DEMO_AGENT_1,
        actorType: "user",
        newValue: JSON.parse(JSON.stringify({ status: "WAITING_INTERNAL", waitingOn: "Engineering team" })),
      },
    });
  }

  const completedItem = createdWorkItems[7]; // Recently completed
  if (completedItem) {
    await prisma.workItemEvent.create({
      data: {
        workItemId: completedItem.id,
        eventType: "status_changed",
        actorId: DEMO_AGENT_1,
        actorType: "user",
        previousValue: JSON.parse(JSON.stringify({ status: "IN_PROGRESS" })),
        newValue: JSON.parse(JSON.stringify({ status: "COMPLETED" })),
        note: "Customer confirmed fix works",
      },
    });
  }

  // Create WorkSignals
  console.log("  Creating work signals...");
  const signalsData = [
    {
      idempotencyKey: `ticket-created-${tickets[0]?.id}`,
      sourceSystem: "internal",
      eventType: "ticket.created",
      payload: JSON.parse(JSON.stringify({ ticketId: tickets[0]?.id, title: tickets[0]?.title })),
      processingStatus: "processed",
      orgId,
      workItemId: createdWorkItems[0]?.id,
      processedAt: new Date(),
    },
    {
      idempotencyKey: `investigation-complete-${investigations[0]?.id}`,
      sourceSystem: "internal",
      eventType: "investigation.awaiting_approval",
      payload: JSON.parse(JSON.stringify({ runId: investigations[0]?.id })),
      processingStatus: "processed",
      orgId,
      workItemId: createdWorkItems[2]?.id,
      processedAt: new Date(),
    },
    {
      idempotencyKey: `incident-created-${incidents[0]?.id}`,
      sourceSystem: "internal",
      eventType: "incident.created",
      payload: JSON.parse(JSON.stringify({ incidentId: incidents[0]?.id })),
      processingStatus: "processed",
      orgId,
      workItemId: createdWorkItems[4]?.id,
      processedAt: new Date(),
    },
    {
      idempotencyKey: "unclassified-webhook-001",
      sourceSystem: "external",
      eventType: "webhook.received",
      payload: JSON.parse(JSON.stringify({ source: "unknown", data: "raw payload" })),
      processingStatus: "processed",
      confidence: 0.3,
      orgId,
      workItemId: createdWorkItems[6]?.id,
      processedAt: new Date(),
    },
  ];

  for (const signal of signalsData) {
    const cleanSignal: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(signal)) {
      if (value !== undefined) cleanSignal[key] = value;
    }
    await prisma.workSignal.create({ data: cleanSignal as Parameters<typeof prisma.workSignal.create>[0]["data"] });
  }

  console.log(`  ${createdWorkItems.length} work items seeded`);
  console.log(`  ${signalsData.length} work signals seeded`);
  console.log("Work item seed complete!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
