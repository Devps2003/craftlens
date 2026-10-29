import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyValidation, type TaskRecordV1 } from "@craftlens/contracts";
import { createFileStore, migrateTask } from "./index";

const workspaceId = "abcdefabcdefabcdefabcdef";

function task(id: string, updatedAt: string): TaskRecordV1 {
  return {
    schemaVersion: 1,
    id,
    workspaceId,
    createdAt: updatedAt,
    updatedAt,
    status: "review_ready",
    promptSummary: "Document the command",
    promptStored: true,
    category: "docs",
    inferredGoals: [],
    changedFiles: [],
    decisions: [],
    risks: [],
    actions: [],
    validation: emptyValidation(),
    analysisStatus: "complete",
    profileId: "learn",
    gitBaseline: { captured: false, paths: [] },
    analysisMeta: { provider: "offline", privacyMode: "local-only", requestCount: 0, contextSources: [] },
  };
}

describe("file store", () => {
  it("round-trips tasks, skips a corrupt line, and deletes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "craftlens-"));
    const store = createFileStore(root, 30);
    await store.saveTask(task("task_1", "2026-10-29T00:00:00.000Z"));
    const dir = path.join(root, "workspaces", workspaceId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "events.jsonl"), "{\"ok\":true}\n{not-json}\n", "utf8");
    const events = await store.readEvents(workspaceId);
    expect(events.skipped).toBe(1);
    expect(events.events).toHaveLength(1);
    const exported = await store.exportWorkspace(workspaceId);
    expect(exported).toContain("task_1");
    expect(exported).not.toContain("/Users/");
    await store.deleteWorkspace(workspaceId);
    expect(await store.loadTasks(workspaceId)).toEqual([]);
  });

  it("drops expired tasks and migrates schema 0", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "craftlens-"));
    const store = createFileStore(root, 1);
    await store.saveTask(task("old", "2020-01-01T00:00:00.000Z"));
    expect(await store.loadTasks(workspaceId)).toEqual([]);
    const migrated = migrateTask(
      JSON.stringify({ schemaVersion: 0, id: "legacy", prompt: "hello", workspaceId }),
    );
    expect(migrated.ok).toBe(true);
    expect(migrateTask("{").ok).toBe(false);
  });

  it("refuses a path used as a workspace id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "craftlens-"));
    const store = createFileStore(root);
    await expect(store.loadTasks("/Users/someone/repo")).rejects.toThrow(/hash/);
  });

  it("recovers a corrupt task file without throwing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "craftlens-"));
    const store = createFileStore(root);
    const dir = path.join(root, "workspaces", workspaceId, "tasks");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "bad.json"), "{", "utf8");
    expect(await store.loadTasks(workspaceId)).toEqual([]);
    const quarantined = await readFile(path.join(dir, "bad.json.corrupt"), "utf8");
    expect(quarantined).toBe("{");
  });
});
