import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createLogger } from "@/lib/logger";
import { BUG_TEMPLATES } from "./templates";
import type { BugTemplate, BugGenerationResult, GeneratedBug } from "./types";

const logger = createLogger("bug-generator");

/**
 * Resolves the demo product repo path.
 * Checks DEMO_PRODUCT_REPO_PATH env var, then common sibling locations.
 */
export function getDemoRepoPath(): string | null {
  if (process.env.DEMO_PRODUCT_REPO_PATH) {
    return process.env.DEMO_PRODUCT_REPO_PATH;
  }

  // Check common sibling locations relative to this project
  const candidates = [
    join(process.cwd(), "..", "support-buddy-demo-product"),
    join(process.cwd(), "..", "..", "support-buddy-demo-product"),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Lists all available bug templates, grouped by service.
 */
export function listTemplates(): {
  service: string;
  templates: Array<{
    id: string;
    title: string;
    severity: string;
    difficulty: string;
    category: string;
  }>;
}[] {
  const grouped = new Map<string, typeof BUG_TEMPLATES>();

  for (const t of BUG_TEMPLATES) {
    if (!grouped.has(t.service)) grouped.set(t.service, []);
    grouped.get(t.service)!.push(t);
  }

  return Array.from(grouped.entries()).map(([service, templates]) => ({
    service,
    templates: templates.map((t) => ({
      id: t.id,
      title: t.title,
      severity: t.severity,
      difficulty: t.difficulty,
      category: t.category,
    })),
  }));
}

/**
 * Gets a template by ID.
 */
export function getTemplate(templateId: string): BugTemplate | undefined {
  return BUG_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Injects a bug into the demo product repo by replacing fixedCode with buggyCode.
 */
export function injectBug(templateId: string, repoPath?: string): BugGenerationResult {
  const template = getTemplate(templateId);
  if (!template) {
    return {
      success: false,
      bug: { templateId, service: "", filePath: "", testFilePath: "", generatedAt: new Date().toISOString() },
      error: `Template "${templateId}" not found`,
    };
  }

  const repo = repoPath ?? getDemoRepoPath();
  if (!repo) {
    return {
      success: false,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      error: "Demo product repo not found. Set DEMO_PRODUCT_REPO_PATH or place repo at ../support-buddy-demo-product",
    };
  }

  const fullPath = join(repo, template.filePath);
  if (!existsSync(fullPath)) {
    return {
      success: false,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      error: `Source file not found: ${fullPath}`,
    };
  }

  try {
    // Read the source file and replace fixedCode with buggyCode
    let content = readFileSync(fullPath, "utf-8");

    if (content.includes(template.buggyCode)) {
      logger.info("Bug already injected", { templateId });
      return {
        success: true,
        bug: {
          templateId,
          service: template.service,
          filePath: template.filePath,
          testFilePath: template.testFilePath,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    if (!content.includes(template.fixedCode)) {
      return {
        success: false,
        bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
        error: "Neither buggy nor fixed code found in source file. File may have been modified.",
      };
    }

    content = content.replace(template.fixedCode, template.buggyCode);
    writeFileSync(fullPath, content, "utf-8");

    // Write the regression test
    const testPath = join(repo, template.testFilePath);
    writeFileSync(testPath, template.testCode, "utf-8");

    logger.info("Bug injected", { templateId, filePath: template.filePath });

    return {
      success: true,
      bug: {
        templateId,
        service: template.service,
        filePath: template.filePath,
        testFilePath: template.testFilePath,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      success: false,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      error: `Failed to inject: ${(err as Error).message}`,
    };
  }
}

/**
 * Fixes a bug by replacing buggyCode with fixedCode (reverses injection).
 */
export function fixBug(templateId: string, repoPath?: string): BugGenerationResult {
  const template = getTemplate(templateId);
  if (!template) {
    return {
      success: false,
      bug: { templateId, service: "", filePath: "", testFilePath: "", generatedAt: new Date().toISOString() },
      error: `Template "${templateId}" not found`,
    };
  }

  const repo = repoPath ?? getDemoRepoPath();
  if (!repo) {
    return {
      success: false,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      error: "Demo product repo not found",
    };
  }

  const fullPath = join(repo, template.filePath);
  if (!existsSync(fullPath)) {
    return {
      success: false,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      error: `Source file not found: ${fullPath}`,
    };
  }

  try {
    let content = readFileSync(fullPath, "utf-8");

    if (content.includes(template.fixedCode)) {
      return {
        success: true,
        bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      };
    }

    if (!content.includes(template.buggyCode)) {
      return {
        success: false,
        bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
        error: "Buggy code not found in source file",
      };
    }

    content = content.replace(template.buggyCode, template.fixedCode);
    writeFileSync(fullPath, content, "utf-8");

    logger.info("Bug fixed", { templateId, filePath: template.filePath });

    return {
      success: true,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
    };
  } catch (err) {
    return {
      success: false,
      bug: { templateId, service: template.service, filePath: template.filePath, testFilePath: template.testFilePath, generatedAt: new Date().toISOString() },
      error: `Failed to fix: ${(err as Error).message}`,
    };
  }
}

/**
 * Checks which bugs are currently active (injected) in the repo.
 */
export function getActiveBugs(repoPath?: string): GeneratedBug[] {
  const repo = repoPath ?? getDemoRepoPath();
  if (!repo) return [];

  const active: GeneratedBug[] = [];

  for (const template of BUG_TEMPLATES) {
    const fullPath = join(repo, template.filePath);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, "utf-8");
    if (content.includes(template.buggyCode)) {
      active.push({
        templateId: template.id,
        service: template.service,
        filePath: template.filePath,
        testFilePath: template.testFilePath,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return active;
}
