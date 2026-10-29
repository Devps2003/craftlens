import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangedFileRef, ValidationSummary } from "@craftlens/contracts";

const execFileAsync = promisify(execFile);

export interface GitRunner {
  run(args: string[], cwd: string): Promise<{ ok: true; stdout: string } | { ok: false; reason: "no-git" | "not-a-repo" | "failed"; detail: string }>;
}

export interface PorcelainEntry {
  code: string;
  path: string;
  origPath?: string;
}

export function parsePorcelain(text: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    const rename = rest.split(" -> ");
    if (rename.length === 2) {
      entries.push({ code, origPath: rename[0], path: rename[1] ?? rename[0] ?? rest });
    } else {
      entries.push({ code, path: rest });
    }
  }
  return entries;
}

export function attributeFiles(input: {
  baselinePaths: string[];
  hookPaths: string[];
  porcelain: PorcelainEntry[];
  gitState: ValidationSummary["git"]["state"];
  binaryPaths?: string[];
}): ChangedFileRef[] {
  const baseline = new Set(input.baselinePaths);
  const binary = new Set(input.binaryPaths ?? []);
  const renamed = new Set(
    input.porcelain.filter((entry) => entry.code.includes("R")).map((entry) => entry.path),
  );
  const names = new Set<string>([
    ...input.hookPaths,
    ...input.porcelain.map((entry) => entry.path),
    ...(input.binaryPaths ?? []),
  ]);
  return [...names].sort().map((relativePath) => {
    let attribution: ChangedFileRef["attribution"] = "unknown";
    if (input.gitState === "available") {
      attribution = baseline.has(relativePath) && !input.hookPaths.includes(relativePath) ? "pre-existing" : "task";
      if (baseline.has(relativePath) && input.hookPaths.includes(relativePath)) attribution = "task";
      if (!input.hookPaths.includes(relativePath) && !baseline.has(relativePath)) attribution = "task";
    }
    return {
      relativePath,
      attribution,
      binary: binary.has(relativePath),
      renamed: renamed.has(relativePath),
      protected: false,
    };
  });
}

export function binaryPathsFromDiff(diff: string): string[] {
  const found: string[] = [];
  const pattern = /^Binary files a\/(.+) and b\/(.+) differ$/gm;
  for (const match of diff.matchAll(pattern)) {
    if (match[2]) found.push(match[2]);
  }
  return found;
}

export function summarizeDiagnostics(
  items: { severity: number; file?: string }[] | null,
): { state: "observed" | "not-observed"; errorCount?: number; warningCount?: number; fileCount?: number } {
  if (!items) return { state: "not-observed" };
  const errorCount = items.filter((item) => item.severity === 0).length;
  const warningCount = items.filter((item) => item.severity === 1).length;
  return {
    state: "observed",
    errorCount,
    warningCount,
    fileCount: new Set(items.map((item) => item.file).filter(Boolean)).size,
  };
}

export function createGitCliRunner(): GitRunner {
  return {
    async run(args, cwd) {
      try {
        const { stdout } = await execFileAsync("git", args, { cwd, timeout: 5000, maxBuffer: 1_000_000 });
        return { ok: true, stdout };
      } catch (error) {
        const message = error instanceof Error ? error.message : "git failed";
        if (/not a git repository/i.test(message)) return { ok: false, reason: "not-a-repo", detail: message };
        if (/ENOENT|spawn git/.test(message)) return { ok: false, reason: "no-git", detail: "git is not installed" };
        return { ok: false, reason: "failed", detail: message.slice(0, 200) };
      }
    },
  };
}

export async function captureBaseline(runner: GitRunner, cwd: string): Promise<{ paths: string[]; limitation?: string; state: ValidationSummary["git"]["state"] }> {
  const result = await runner.run(["status", "--porcelain"], cwd);
  if (!result.ok) {
    const state = result.reason === "no-git" ? "no-git" : result.reason === "not-a-repo" ? "not-a-repo" : "unavailable";
    return {
      paths: [],
      state,
      limitation:
        state === "no-git"
          ? "Git is not available. Changed files are only those reported by edits."
          : state === "not-a-repo"
            ? "This folder is not a Git repository. Pre-existing edits cannot be separated."
            : "Git status failed. Pre-existing edits cannot be separated.",
    };
  }
  return { paths: parsePorcelain(result.stdout).map((entry) => entry.path), state: "available" };
}

export async function captureDiff(
  runner: GitRunner,
  cwd: string,
): Promise<{ summary: string; binaryPaths: string[]; porcelain: PorcelainEntry[]; state: ValidationSummary["git"]["state"]; limitation?: string }> {
  const status = await runner.run(["status", "--porcelain"], cwd);
  if (!status.ok) {
    const state = status.reason === "no-git" ? "no-git" : status.reason === "not-a-repo" ? "not-a-repo" : "unavailable";
    return {
      summary: "No Git diff is available.",
      binaryPaths: [],
      porcelain: [],
      state,
      limitation: status.detail,
    };
  }
  const diff = await runner.run(["diff", "--stat"], cwd);
  const summary = diff.ok ? diff.stdout.trim().slice(0, 1200) : "Git status is available, but git diff failed.";
  const full = await runner.run(["diff"], cwd);
  return {
    summary: summary || "Git reports no unstaged diff.",
    binaryPaths: full.ok ? binaryPathsFromDiff(full.stdout) : [],
    porcelain: parsePorcelain(status.stdout),
    state: "available",
    limitation: diff.ok ? undefined : "Diff text could not be read. File names come from git status only.",
  };
}
