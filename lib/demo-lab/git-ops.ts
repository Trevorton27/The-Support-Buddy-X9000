/**
 * Demo Lab Git Operations — GitHub API functions for branch management and defect injection.
 *
 * Uses the GitHub REST API to create branches, apply patches, and manage demo scenario branches.
 * Falls back to local file operations when DEMO_PRODUCT_REPO_PATH is set.
 */

import { createLogger } from "@/lib/logger";

const logger = createLogger("demo-lab-git-ops");

const GITHUB_API = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for git operations");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Get the SHA of a branch's HEAD.
 */
export async function getBranchSha(repo: string, branch: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get branch SHA: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.object.sha;
}

/**
 * Create a new branch from a base branch.
 */
export async function createBranch(repo: string, branchName: string, baseBranch: string = "main"): Promise<string> {
  const baseSha = await getBranchSha(repo, baseBranch);

  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/refs`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // Branch might already exist
    if (res.status === 422 && text.includes("Reference already exists")) {
      logger.info("Branch already exists", { repo, branchName });
      return await getBranchSha(repo, branchName);
    }
    throw new Error(`Failed to create branch: ${res.status} ${text}`);
  }

  const data = await res.json();
  logger.info("Branch created", { repo, branchName, sha: data.object.sha });
  return data.object.sha;
}

/**
 * Get the contents of a file from a specific branch.
 */
export async function getFileContent(repo: string, path: string, branch: string): Promise<{ content: string; sha: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}?ref=${branch}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to get file: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

/**
 * Update a file on a branch via the GitHub Contents API.
 */
export async function updateFile(
  repo: string,
  path: string,
  branch: string,
  newContent: string,
  fileSha: string,
  commitMessage: string
): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(newContent).toString("base64"),
      sha: fileSha,
      branch,
    }),
  });

  if (!res.ok) throw new Error(`Failed to update file: ${res.status} ${await res.text()}`);
  const data = await res.json();
  logger.info("File updated", { repo, path, branch, commitSha: data.commit.sha });
  return data.commit.sha;
}

/**
 * Create or update a file on a branch (handles both new and existing files).
 */
export async function upsertFile(
  repo: string,
  path: string,
  branch: string,
  content: string,
  commitMessage: string
): Promise<string> {
  // Try to get existing file SHA
  let fileSha: string | undefined;
  try {
    const existing = await getFileContent(repo, path, branch);
    fileSha = existing.sha;
  } catch {
    // File doesn't exist yet, which is fine for creation
  }

  const body: Record<string, unknown> = {
    message: commitMessage,
    content: Buffer.from(content).toString("base64"),
    branch,
  };
  if (fileSha) body.sha = fileSha;

  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Failed to upsert file: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.commit.sha;
}

/**
 * Apply a defect to a file on a branch by replacing fixedCode with buggyCode.
 */
export async function applyDefect(
  repo: string,
  branch: string,
  filePath: string,
  fixedCode: string,
  buggyCode: string
): Promise<string> {
  const { content, sha } = await getFileContent(repo, filePath, branch);

  if (content.includes(buggyCode)) {
    logger.info("Defect already applied", { repo, branch, filePath });
    return await getBranchSha(repo, branch);
  }

  if (!content.includes(fixedCode)) {
    throw new Error(`Fixed code not found in ${filePath} — file may have been modified`);
  }

  const newContent = content.replace(fixedCode, buggyCode);
  return await updateFile(repo, filePath, branch, newContent, sha, `Inject defect in ${filePath}`);
}

/**
 * Write a regression test file to a branch.
 */
export async function writeTestFile(
  repo: string,
  branch: string,
  testFilePath: string,
  testCode: string
): Promise<string> {
  return await upsertFile(repo, testFilePath, branch, testCode, `Add regression test: ${testFilePath}`);
}

/**
 * Delete a branch.
 */
export async function deleteBranch(repo: string, branchName: string): Promise<void> {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branchName}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (res.ok || res.status === 422) {
    logger.info("Branch deleted", { repo, branchName });
    return;
  }

  // 404 means already deleted
  if (res.status === 404) return;

  throw new Error(`Failed to delete branch: ${res.status}`);
}

/**
 * Full defect injection: create branch, apply defect, write test.
 */
export async function injectDefectOnBranch(
  repo: string,
  baseBranch: string,
  runBranch: string,
  defect: {
    filePath: string;
    fixedCode: string;
    buggyCode: string;
    testFilePath: string;
    testCode: string;
  }
): Promise<{ branchSha: string; defectCommitSha: string; testCommitSha: string }> {
  const branchSha = await createBranch(repo, runBranch, baseBranch);
  const defectCommitSha = await applyDefect(repo, runBranch, defect.filePath, defect.fixedCode, defect.buggyCode);
  const testCommitSha = await writeTestFile(repo, runBranch, defect.testFilePath, defect.testCode);

  logger.info("Defect injected on branch", {
    repo, runBranch, defectCommitSha, testCommitSha,
  });

  return { branchSha, defectCommitSha, testCommitSha };
}
