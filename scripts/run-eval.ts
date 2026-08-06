/**
 * Phase 7: CLI eval runner.
 * Usage: npx tsx scripts/run-eval.ts --name nightly-v1
 */
import { PrismaClient } from "@prisma/client";
import { runEvalSuite } from "../lib/eval-runner";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const nameIdx = args.indexOf("--name");
  const name = nameIdx !== -1 ? args[nameIdx + 1] : `eval-${new Date().toISOString().slice(0, 10)}`;
  const modelIdx = args.indexOf("--model");
  const model = modelIdx !== -1 ? args[modelIdx + 1] : "gpt-4o";

  if (!name) {
    console.error("Usage: npx tsx scripts/run-eval.ts --name <name>");
    process.exit(1);
  }

  const examples = await prisma.evalExample.findMany();
  console.log(`Starting eval run "${name}" with ${examples.length} examples`);

  if (examples.length === 0) {
    console.log("No eval examples found. Run scripts/export-eval-data.ts first, or create examples via the UI.");
    await prisma.$disconnect();
    return;
  }

  const run = await prisma.evalRun.create({
    data: {
      name,
      triggeredBy: "cli",
      status: "running",
      model,
    },
  });

  console.log(`Created eval run: ${run.id} (model: ${model})`);

  await runEvalSuite(run.id, undefined, model);

  const completed = await prisma.evalRun.findUnique({
    where: { id: run.id },
    include: { results: true },
  });

  console.log(`\n=== Eval Complete ===`);
  console.log(`Pass Rate: ${((completed?.passRate ?? 0) * 100).toFixed(1)}%`);
  console.log(`Avg Score: ${((completed?.avgScore ?? 0) * 100).toFixed(1)}%`);
  console.log(`Total Examples: ${completed?.results.length}`);
  console.log(`Passed: ${completed?.results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${completed?.results.filter((r) => !r.passed).length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
