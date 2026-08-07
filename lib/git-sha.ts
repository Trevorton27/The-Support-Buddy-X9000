import { execSync } from "child_process";

let _gitSha: string | undefined;

export function getGitSha(): string {
  if (_gitSha !== undefined) return _gitSha;
  try {
    _gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    _gitSha = "unknown";
  }
  return _gitSha;
}
