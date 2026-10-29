import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GitRunner } from "@craftlens/context";
import { CraftLensController } from "./controller";

const workspaceId = "abc123abc123abc123abc123";

function git(): GitRunner {
  return {
    async run(args) {
      if (args[0] === "status") return { ok: true, stdout: " M README.md\n" };
      if (args[0] === "diff" && args[1] === "--stat") return { ok: true, stdout: " src/consumer.ts | 3 +\n" };
      return { ok: true, stdout: "" };
    },
  };
}

describe("controller", () => {
  it("loads a synthetic review without a provider key and keeps sessions apart", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "craftlens-data-"));
    const controller = new CraftLensController({
      workspaceId,
      roots: ["/tmp/craftlens-fixture"],
      dataRoot,
      git: git(),
      now: () => "2026-10-29T00:00:00.000Z",
    });
    controller.setApiKey("sk-do-not-leak");
    await controller.loadSynthetic();
    const view = controller.view();
    expect(view.phase).toBe("review");
    expect(view.connection).toBe("synthetic");
    expect(view.offline).toBe(true);
    expect(view.task?.changedFiles.some((file) => file.relativePath === "README.md" && file.attribution === "pre-existing")).toBe(true);
    expect(view.task?.validation.tests).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("sk-do-not-leak");

    await controller.ingest({
      schemaVersion: 1,
      eventId: "44444444-4444-4444-8444-444444444444",
      occurredAt: "2026-10-29T00:00:00.000Z",
      source: "cursor-hook",
      workspaceId,
      sessionId: "other",
      kind: "prompt.submitted",
      payload: { text: "Fix the auth check", redacted: false, attachmentCount: 0 },
    });
    expect(controller.view().history.length).toBeGreaterThan(1);
    const other = controller.view().history.find((item) => item.title.includes("auth"));
    expect(other).toBeTruthy();
  });

  it("rejects a bad panel message and a path outside the workspace", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "craftlens-data-"));
    const controller = new CraftLensController({
      workspaceId,
      roots: ["/tmp/craftlens-fixture"],
      dataRoot,
      now: () => "2026-10-29T00:00:00.000Z",
    });
    await controller.handle({ schemaVersion: 1, type: "launch-shell" });
    expect(controller.view().notice).toMatch(/invalid panel message/);
    const opened = await controller.handle({ schemaVersion: 1, type: "open-file", path: "../secrets" });
    expect(opened.openPath).toBeUndefined();
    expect(controller.view().notice).toMatch(/outside the workspace/);
  });

  it("uses a discovered FreeLLMAPI key without putting it in the panel", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "craftlens-data-"));
    const apiKey = `freellmapi-${"ab".repeat(24)}`;
    const controller = new CraftLensController({
      workspaceId,
      roots: ["/tmp/craftlens-fixture"],
      dataRoot,
      now: () => "2026-10-29T00:00:00.000Z",
      discover: async () => ({ baseUrl: "http://127.0.0.1:31415/v1", apiKey, model: "auto" }),
    });
    await controller.prepare();
    const view = controller.view();
    expect(view.offline).toBe(false);
    expect(JSON.stringify(view)).not.toContain(apiKey);
    expect(view.privacyMode).toBe("prompt-summary");
  });
});
