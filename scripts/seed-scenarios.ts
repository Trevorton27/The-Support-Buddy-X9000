/**
 * Seed DemoIssueScenario + CodeRepository + ProductService records.
 *
 * Usage: npx tsx scripts/seed-scenarios.ts
 */

import { PrismaClient } from "@prisma/client";
import { BUG_TEMPLATES } from "../lib/bug-generator/templates";

const prisma = new PrismaClient();

const DEMO_REPO = "Trevorton27/support-buddy-demo-product";
const DEMO_REPO_URL = `https://github.com/${DEMO_REPO}`;

async function main() {
  console.log("Seeding CodeRepository...");
  const repo = await prisma.codeRepository.upsert({
    where: { orgId_repository: { orgId: "", repository: DEMO_REPO } },
    update: { name: "Support Buddy Demo Product", allowedForDevin: true },
    create: {
      name: "Support Buddy Demo Product",
      owner: "Trevorton27",
      repository: DEMO_REPO,
      defaultBranch: "main",
      allowedForDevin: true,
    },
  });
  console.log(`  CodeRepository: ${repo.id} (${repo.repository})`);

  // Seed ProductService for each unique service in templates
  const services = [...new Set(BUG_TEMPLATES.map((t) => t.service))];
  for (const serviceName of services) {
    const template = BUG_TEMPLATES.find((t) => t.service === serviceName)!;
    const workingDir = `services/${serviceName}`;
    await prisma.productService.upsert({
      where: { name: serviceName },
      update: { repositoryId: repo.id, workingDir },
      create: {
        name: serviceName,
        repositoryId: repo.id,
        workingDir,
        pathPatterns: JSON.parse(JSON.stringify([`${workingDir}/**`])),
        testCommand: `npm run test:${serviceName.replace("-service", "").replace("-client", "").replace("-limiter", "rate-limiter")}`,
      },
    });
    console.log(`  ProductService: ${serviceName}`);
  }

  // Seed DemoIssueScenario from BUG_TEMPLATES
  console.log("\nSeeding DemoIssueScenarios...");
  for (const t of BUG_TEMPLATES) {
    const scenario = await prisma.demoIssueScenario.upsert({
      where: { key: t.id },
      update: {
        title: t.title,
        description: t.description,
        repository: DEMO_REPO_URL,
        service: t.service,
        severity: t.severity,
        difficulty: t.difficulty,
        category: t.category,
        affectedPaths: JSON.parse(JSON.stringify([t.filePath, t.testFilePath])),
        ticketTemplate: JSON.parse(JSON.stringify(t.ticket)),
        evidenceTemplate: JSON.parse(
          JSON.stringify({
            deployment: t.deployment ?? null,
            logs: [],
            traces: [],
          })
        ),
        acceptanceCriteria: JSON.parse(
          JSON.stringify([
            `Fix the defect in ${t.filePath}`,
            `All tests in ${t.testFilePath} must pass`,
            "No regressions in other service tests",
          ])
        ),
        reproductionSteps: JSON.parse(
          JSON.stringify([
            `Clone ${DEMO_REPO_URL}`,
            `Run: cd services/${t.service} && npm test`,
            `Observe failing test in ${t.testFilePath}`,
            `Inspect ${t.filePath} for the defect`,
          ])
        ),
        defectPatch: JSON.parse(
          JSON.stringify({
            buggyCode: t.buggyCode,
            fixedCode: t.fixedCode,
            filePath: t.filePath,
            testFilePath: t.testFilePath,
            testCode: t.testCode,
          })
        ),
      },
      create: {
        key: t.id,
        title: t.title,
        description: t.description,
        repository: DEMO_REPO_URL,
        service: t.service,
        severity: t.severity,
        difficulty: t.difficulty,
        category: t.category,
        affectedPaths: JSON.parse(JSON.stringify([t.filePath, t.testFilePath])),
        ticketTemplate: JSON.parse(JSON.stringify(t.ticket)),
        evidenceTemplate: JSON.parse(
          JSON.stringify({
            deployment: t.deployment ?? null,
            logs: [],
            traces: [],
          })
        ),
        acceptanceCriteria: JSON.parse(
          JSON.stringify([
            `Fix the defect in ${t.filePath}`,
            `All tests in ${t.testFilePath} must pass`,
            "No regressions in other service tests",
          ])
        ),
        reproductionSteps: JSON.parse(
          JSON.stringify([
            `Clone ${DEMO_REPO_URL}`,
            `Run: cd services/${t.service} && npm test`,
            `Observe failing test in ${t.testFilePath}`,
            `Inspect ${t.filePath} for the defect`,
          ])
        ),
        defectPatch: JSON.parse(
          JSON.stringify({
            buggyCode: t.buggyCode,
            fixedCode: t.fixedCode,
            filePath: t.filePath,
            testFilePath: t.testFilePath,
            testCode: t.testCode,
          })
        ),
      },
    });
    console.log(`  ${scenario.key}: ${scenario.title}`);
  }

  console.log("\nDone! Seeded scenarios and repository config.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
