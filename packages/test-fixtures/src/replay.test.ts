import { describe, expect, it } from "vitest";
import { analyzeTask } from "@craftlens/analysis";
import { applyEvent, emptySnapshot } from "@craftlens/core";
import { mapCursorPayload } from "@craftlens/hook-bridge";
import { hashRoots } from "@craftlens/security";

const roots = ["/tmp/craftlens-fixture"];
const workspaceId = hashRoots(roots);

const scenarios: { name: string; prompt: string; file?: string }[] = [
  { name: "docs", prompt: "Update the README for the health check", file: "README.md" },
  { name: "bug", prompt: "Fix the failing parser", file: "src/parser.ts" },
  { name: "mongo", prompt: "Add a mongodb index for the tenant query", file: "src/repo.ts" },
  { name: "queue", prompt: "Add an SQS consumer with retry and idempotency", file: "src/consumer.ts" },
  { name: "auth", prompt: "Check permission before updating the order", file: "src/auth.ts" },
  { name: "refactor", prompt: "Refactor the module boundary", file: "src/a.ts" },
  { name: "text-only", prompt: "Explain the trade-off of this approach" },
  { name: "secret", prompt: "Use sk-testsecret1234567890 in the sample" },
];

describe("synthetic session replay", () => {
  it("walks prompt, edit, and stop without mixing two sessions", async () => {
    let snapshot = emptySnapshot();
    for (const [index, scenario] of scenarios.entries()) {
      const sessionId = `conv-${index}`;
      const prompt = mapCursorPayload({
        hook_event_name: "beforeSubmitPrompt",
        conversation_id: sessionId,
        workspace_roots: roots,
        prompt: scenario.prompt,
        user_email: "hidden@example.com",
      });
      expect(prompt.ok).toBe(true);
      if (!prompt.ok) continue;
      expect(JSON.stringify(prompt.event)).not.toContain("hidden@example.com");
      expect(prompt.event.workspaceId).toBe(workspaceId);
      snapshot = applyEvent(snapshot, prompt.event).snapshot;
      if (scenario.file) {
        const edit = mapCursorPayload({
          hook_event_name: "afterFileEdit",
          conversation_id: sessionId,
          workspace_roots: roots,
          file_path: `/tmp/craftlens-fixture/${scenario.file}`,
          edits: [{ old_string: "a", new_string: "b" }],
        });
        expect(edit.ok).toBe(true);
        if (edit.ok) snapshot = applyEvent(snapshot, edit.event).snapshot;
      }
      const stop = mapCursorPayload({
        hook_event_name: "stop",
        conversation_id: sessionId,
        workspace_roots: roots,
        status: "completed",
        loop_count: 0,
      });
      expect(stop.ok).toBe(true);
      if (stop.ok) snapshot = applyEvent(snapshot, stop.event).snapshot;
    }
    expect(snapshot.tasks).toHaveLength(scenarios.length);
    const secretTask = snapshot.tasks.find((task) => task.sessionId === "conv-7");
    expect(secretTask?.promptSummary).not.toContain("sk-testsecret");
    const malformed = mapCursorPayload({ hook_event_name: "beforeSubmitPrompt", prompt: 12, workspace_roots: roots });
    expect(malformed.ok).toBe(false);
    const outside = mapCursorPayload({
      hook_event_name: "afterFileEdit",
      conversation_id: "conv-0",
      workspace_roots: roots,
      file_path: "/etc/passwd",
      edits: [],
    });
    expect(outside.ok).toBe(false);

    const overlappingA = snapshot.tasks.find((task) => task.sessionId === "conv-3");
    const overlappingB = snapshot.tasks.find((task) => task.sessionId === "conv-4");
    expect(overlappingA?.changedFiles.some((file) => file.relativePath === "src/auth.ts")).toBe(false);
    expect(overlappingB?.changedFiles.some((file) => file.relativePath === "src/consumer.ts")).toBe(false);

    const review = await analyzeTask({
      task: { ...overlappingA!, status: "completion_detected" },
      profileId: "reliability-security",
      privacyMode: "local-only",
      provider: null,
      apiKey: "",
      baseUrl: "",
      model: "",
      dismissedPrincipleIds: [],
      signal: new AbortController().signal,
      now: "2026-10-29T00:00:00.000Z",
    });
    expect(review.task.status).toBe("review_ready");
    expect(review.task.risks.every((risk) => risk.confidence !== "verified")).toBe(true);
  });
});
