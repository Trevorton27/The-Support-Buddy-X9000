/**
 * knowledge-evaluate.ts
 *
 * Evaluates retrieval quality against the golden query set in
 * knowledge/evals/retrieval-eval.json.
 *
 * For each query it calls retrieveKnowledge() at topK=5 and checks whether
 * any expected document title appears in the returned results, using a
 * case-insensitive substring match in both directions.
 *
 * Output:
 *   Per-query pass/fail table
 *   Top-1 / Top-3 / Top-5 hit rates
 *   Miss report: queries with zero hits + their expected titles
 *
 * Usage:
 *   npm run knowledge:evaluate
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { retrieveKnowledge } from "../lib/knowledge-retrieval";

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalQuery {
  id: string;
  query: string;
  expected_titles: string[];
}

// ─── Title matching ───────────────────────────────────────────────────────────

function titlesMatch(retrieved: string, expected: string): boolean {
  const r = retrieved.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  return r.includes(e) || e.includes(r);
}

function hitAtK(
  retrievedTitles: string[],
  expectedTitles: string[],
  k: number,
): boolean {
  return retrievedTitles.slice(0, k).some((r) =>
    expectedTitles.some((e) => titlesMatch(r, e)),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Check that the knowledge base has documents
  const docCount = await prisma.knowledgeDocument.count();
  if (docCount === 0) {
    console.error(
      "\nKnowledge base is empty. Run `npm run knowledge:ingest` first.\n",
    );
    process.exit(1);
  }

  const evalPath = join(process.cwd(), "knowledge", "evals", "retrieval-eval.json");
  const queries: EvalQuery[] = JSON.parse(readFileSync(evalPath, "utf-8"));

  console.log("\nKnowledge Base Retrieval Evaluation");
  console.log(`${docCount} documents indexed · ${queries.length} queries`);
  console.log("─".repeat(72));

  interface QueryResult {
    id: string;
    query: string;
    expectedTitles: string[];
    retrievedTitles: string[];
    hit1: boolean;
    hit3: boolean;
    hit5: boolean;
  }

  const results: QueryResult[] = [];

  for (const eq of queries) {
    process.stdout.write(`  ${eq.id}  ${eq.query.slice(0, 55).padEnd(56)}`);

    let retrievedTitles: string[] = [];
    try {
      const evidence = await retrieveKnowledge(eq.query, {
        limit: 5,
        minScore: 0.0,   // include all to evaluate at different K thresholds
        skipAudit: true,
      });
      retrievedTitles = evidence.map((e) => e.documentTitle);
    } catch (err) {
      process.stdout.write("ERROR\n");
      console.error(`    ${String(err)}`);
      results.push({
        id: eq.id,
        query: eq.query,
        expectedTitles: eq.expected_titles,
        retrievedTitles: [],
        hit1: false,
        hit3: false,
        hit5: false,
      });
      continue;
    }

    const hit1 = hitAtK(retrievedTitles, eq.expected_titles, 1);
    const hit3 = hitAtK(retrievedTitles, eq.expected_titles, 3);
    const hit5 = hitAtK(retrievedTitles, eq.expected_titles, 5);

    const mark = hit1 ? "✓" : hit3 ? "~" : hit5 ? "·" : "✗";
    process.stdout.write(`${mark}\n`);

    results.push({ id: eq.id, query: eq.query, expectedTitles: eq.expected_titles, retrievedTitles, hit1, hit3, hit5 });
  }

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const n = results.length;
  const hits1 = results.filter((r) => r.hit1).length;
  const hits3 = results.filter((r) => r.hit3).length;
  const hits5 = results.filter((r) => r.hit5).length;

  const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`.padStart(4);

  console.log("\n" + "─".repeat(72));
  console.log("Results");
  console.log(`  Top-1 hit rate: ${pct(hits1)}  (${hits1}/${n})`);
  console.log(`  Top-3 hit rate: ${pct(hits3)}  (${hits3}/${n})`);
  console.log(`  Top-5 hit rate: ${pct(hits5)}  (${hits5}/${n})`);

  // ── Legend ─────────────────────────────────────────────────────────────────
  console.log("\nLegend: ✓ hit@1  ~ hit@3  · hit@5  ✗ miss");

  // ── Miss report ────────────────────────────────────────────────────────────
  const misses = results.filter((r) => !r.hit5);
  if (misses.length > 0) {
    console.log("\n" + "─".repeat(72));
    console.log(`Miss Report (${misses.length} quer${misses.length === 1 ? "y" : "ies"} with no hit in top-5)\n`);
    for (const m of misses) {
      console.log(`  ${m.id}: ${m.query}`);
      console.log(`    Expected: ${m.expectedTitles.join(", ")}`);
      if (m.retrievedTitles.length > 0) {
        console.log(`    Retrieved: ${m.retrievedTitles.join(", ")}`);
      } else {
        console.log(`    Retrieved: (none)`);
      }
    }
  } else {
    console.log("\nAll queries returned at least one expected document in top-5.");
  }

  console.log();
}

main()
  .catch((e) => {
    console.error("knowledge-evaluate failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
