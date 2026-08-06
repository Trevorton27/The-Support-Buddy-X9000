import { prisma } from "@/lib/db";

interface ExportRow {
  ticketId: string;
  title: string;
  description: string;
  category: string | null;
  product: string | null;
  severity: string;
  status: string;
  createdAt: string;
  trueRootCause: string;
  trueCategory: string;
  trueSeverity: string;
  affectedProduct: string;
  injectedFaults: string[];
  difficulty: string;
  scenario: string | null;
  scenarioRole: string | null;
  overallScore: number | null;
  passed: boolean | null;
}

async function fetchBatchRows(batchId: string): Promise<ExportRow[]> {
  const metas = await prisma.generatedTicketMeta.findMany({
    where: { batchId },
    include: { ticket: true },
    orderBy: { createdAt: "asc" },
  });

  return metas.map((m) => {
    const scoreCache = m.scoreCache as Record<string, unknown> | null;
    return {
      ticketId: m.ticketId,
      title: m.ticket.title,
      description: m.ticket.description,
      category: m.ticket.category,
      product: m.ticket.product,
      severity: m.ticket.severity,
      status: m.ticket.status,
      createdAt: m.ticket.createdAt.toISOString(),
      trueRootCause: m.trueRootCause,
      trueCategory: m.trueCategory,
      trueSeverity: m.trueSeverity,
      affectedProduct: m.affectedProduct,
      injectedFaults: Array.isArray(m.injectedFaults) ? (m.injectedFaults as string[]) : [],
      difficulty: m.difficulty,
      scenario: m.scenario,
      scenarioRole: m.scenarioRole,
      overallScore: typeof scoreCache?.overallScore === "number" ? scoreCache.overallScore : null,
      passed: typeof scoreCache?.passed === "boolean" ? scoreCache.passed : null,
    };
  });
}

export async function exportBatchAsJson(batchId: string): Promise<string> {
  const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
  const rows = await fetchBatchRows(batchId);
  return JSON.stringify({ batch, tickets: rows }, null, 2);
}

export async function exportBatchAsCsv(batchId: string): Promise<string> {
  const rows = await fetchBatchRows(batchId);
  if (rows.length === 0) return "";

  const headers = [
    "ticketId", "title", "description", "category", "product", "severity", "status",
    "createdAt", "trueRootCause", "trueCategory", "trueSeverity", "affectedProduct",
    "injectedFaults", "difficulty", "scenario", "scenarioRole", "overallScore", "passed",
  ];

  const csvEscape = (v: unknown): string => {
    const str = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("|") : String(v);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h as keyof ExportRow])).join(",")),
  ];
  return lines.join("\n");
}

export async function exportBatchAsMarkdown(batchId: string): Promise<string> {
  const batch = await prisma.generationBatch.findUnique({ where: { id: batchId } });
  const rows = await fetchBatchRows(batchId);

  const lines: string[] = [
    `# Batch Export: ${batch?.name ?? batchId}`,
    "",
    `**Mode:** ${batch?.mode} | **Status:** ${batch?.status} | **Total:** ${rows.length} tickets`,
    "",
    "---",
    "",
  ];

  for (const row of rows) {
    lines.push(`## ${row.title}`);
    lines.push("");
    lines.push(`**Ticket ID:** ${row.ticketId}  `);
    lines.push(`**Severity:** ${row.severity} | **Category:** ${row.category ?? "—"} | **Product:** ${row.product ?? "—"}  `);
    lines.push(`**Difficulty:** ${row.difficulty}`);
    lines.push("");
    lines.push("### Customer Description");
    lines.push(row.description);
    lines.push("");
    lines.push("### Ground Truth");
    lines.push(`- **True Root Cause:** ${row.trueRootCause}`);
    lines.push(`- **True Severity:** ${row.trueSeverity}`);
    lines.push(`- **True Category:** ${row.trueCategory}`);
    lines.push(`- **Affected Product:** ${row.affectedProduct}`);
    if (row.injectedFaults.length > 0) {
      lines.push(`- **Injected Faults:** ${row.injectedFaults.join("; ")}`);
    }
    if (row.overallScore !== null) {
      lines.push(`- **Training Score:** ${Math.round(row.overallScore * 100)}% (${row.passed ? "PASS" : "FAIL"})`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
