import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { taskRecordSchema, type CompanionEventV1, type TaskRecordV1 } from "@craftlens/contracts";

export interface TaskStore {
  loadTasks(workspaceId: string): Promise<TaskRecordV1[]>;
  saveTask(task: TaskRecordV1): Promise<void>;
  appendEvent(workspaceId: string, event: CompanionEventV1): Promise<void>;
  readEvents(workspaceId: string): Promise<{ events: CompanionEventV1[]; skipped: number }>;
  deleteTask(workspaceId: string, taskId: string): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  exportWorkspace(workspaceId: string): Promise<string>;
  readFeedback(workspaceId: string): Promise<FeedbackEntry[]>;
  writeFeedback(workspaceId: string, entries: FeedbackEntry[]): Promise<void>;
}

export interface FeedbackEntry {
  workspaceId: string;
  taskId: string;
  cardId: string;
  principleId?: string;
  useful: boolean;
  note?: string;
  at: string;
}

export function createFileStore(root: string, retentionDays = 30): TaskStore {
  return new FileTaskStore(root, retentionDays);
}

class FileTaskStore implements TaskStore {
  constructor(
    private readonly root: string,
    private readonly retentionDays: number,
  ) {}

  async loadTasks(workspaceId: string): Promise<TaskRecordV1[]> {
    assertId(workspaceId);
    const dir = this.taskDir(workspaceId);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const tasks: TaskRecordV1[] = [];
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const full = path.join(dir, name);
      const raw = await readFile(full, "utf8");
      const migrated = migrateTask(raw);
      if (!migrated.ok) {
        await rename(full, `${full}.corrupt`).catch(() => undefined);
        continue;
      }
      if (Date.parse(migrated.task.updatedAt) < cutoff) {
        await rm(full, { force: true });
        continue;
      }
      tasks.push(migrated.task);
    }
    tasks.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return tasks;
  }

  async saveTask(task: TaskRecordV1): Promise<void> {
    assertId(task.workspaceId);
    const parsed = taskRecordSchema.parse(task);
    const dir = this.taskDir(parsed.workspaceId);
    await mkdir(dir, { recursive: true });
    await withLock(this.workspaceDir(parsed.workspaceId), async () => {
      const target = path.join(dir, `${parsed.id}.json`);
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(parsed)}\n`, "utf8");
      await rename(tmp, target);
    });
  }

  async appendEvent(workspaceId: string, event: CompanionEventV1): Promise<void> {
    assertId(workspaceId);
    const dir = this.workspaceDir(workspaceId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, { flag: "a" });
  }

  async readEvents(workspaceId: string): Promise<{ events: CompanionEventV1[]; skipped: number }> {
    assertId(workspaceId);
    let raw = "";
    try {
      raw = await readFile(path.join(this.workspaceDir(workspaceId), "events.jsonl"), "utf8");
    } catch {
      return { events: [], skipped: 0 };
    }
    const events: CompanionEventV1[] = [];
    let skipped = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as CompanionEventV1);
      } catch {
        skipped += 1;
      }
    }
    return { events, skipped };
  }

  async deleteTask(workspaceId: string, taskId: string): Promise<void> {
    assertId(workspaceId);
    await rm(path.join(this.taskDir(workspaceId), `${taskId}.json`), { force: true });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    assertId(workspaceId);
    await rm(this.workspaceDir(workspaceId), { recursive: true, force: true });
  }

  async exportWorkspace(workspaceId: string): Promise<string> {
    const tasks = await this.loadTasks(workspaceId);
    return JSON.stringify({ schemaVersion: 1, workspaceId, tasks }, null, 2);
  }

  async readFeedback(workspaceId: string): Promise<FeedbackEntry[]> {
    assertId(workspaceId);
    try {
      const raw = await readFile(path.join(this.workspaceDir(workspaceId), "feedback.json"), "utf8");
      const parsed = JSON.parse(raw) as FeedbackEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async writeFeedback(workspaceId: string, entries: FeedbackEntry[]): Promise<void> {
    assertId(workspaceId);
    const dir = this.workspaceDir(workspaceId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "feedback.json"), JSON.stringify(entries), "utf8");
  }

  private workspaceDir(workspaceId: string): string {
    return path.join(this.root, "workspaces", workspaceId);
  }

  private taskDir(workspaceId: string): string {
    return path.join(this.workspaceDir(workspaceId), "tasks");
  }
}

function assertId(workspaceId: string): void {
  if (!/^[a-f0-9]{24}$/.test(workspaceId)) {
    throw new Error("workspace id must be a hash, not a path");
  }
}

export function migrateTask(raw: string): { ok: true; task: TaskRecordV1 } | { ok: false; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid json" };
  }
  if (!value || typeof value !== "object") return { ok: false, reason: "not an object" };
  const record = value as Record<string, unknown>;
  if (record.schemaVersion === 0 && typeof record.id === "string" && typeof record.prompt === "string") {
    const now = new Date(0).toISOString();
    const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : "0".repeat(24);
    const upgraded = taskRecordSchema.safeParse({
      schemaVersion: 1,
      id: record.id,
      workspaceId,
      createdAt: now,
      updatedAt: now,
      status: "unknown",
      promptSummary: record.prompt,
      promptStored: true,
      category: "unknown",
      inferredGoals: [],
      changedFiles: [],
      decisions: [],
      risks: [],
      actions: [],
      validation: {
        changedFiles: [],
        tests: [],
        diagnostics: { state: "not-observed" },
        git: { state: "unavailable", summary: "Migrated from schema 0 without git evidence." },
        remainingChecks: [],
        acceptance: [],
      },
      analysisStatus: "not-started",
      profileId: "learn",
      gitBaseline: { captured: false, paths: [] },
      analysisMeta: {
        provider: "offline",
        privacyMode: "local-only",
        requestCount: 0,
        contextSources: ["migration:v0"],
      },
    });
    return upgraded.success ? { ok: true, task: upgraded.data } : { ok: false, reason: "v0 upgrade failed" };
  }
  const parsed = taskRecordSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "schema mismatch" };
  return { ok: true, task: parsed.data };
}

async function withLock(dir: string, fn: () => Promise<void>): Promise<void> {
  await mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, ".lock");
  const start = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      break;
    } catch {
      if (Date.now() - start > 2000) throw new Error("storage lock timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  try {
    await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}
