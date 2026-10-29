import { describe, expect, it } from "vitest";
import type { CompanionEventV1 } from "@craftlens/contracts";
import { applyEvent, emptySnapshot } from "./engine";

const workspaceId = "abc123abc123abc123abc123";

function event(partial: Pick<CompanionEventV1, "kind" | "payload"> & Partial<CompanionEventV1>): CompanionEventV1 {
  return {
    schemaVersion: 1,
    eventId: partial.eventId ?? crypto.randomUUID(),
    occurredAt: partial.occurredAt ?? "2026-10-29T00:00:00.000Z",
    source: partial.source ?? "cursor-hook",
    workspaceId,
    sessionId: partial.sessionId,
    taskId: partial.taskId,
    kind: partial.kind,
    payload: partial.payload,
  } as CompanionEventV1;
}

describe("task state machine", () => {
  it("creates a task from a prompt and ignores a duplicate event id", () => {
    const prompt = event({
      eventId: "11111111-1111-4111-8111-111111111111",
      sessionId: "s1",
      kind: "prompt.submitted",
      payload: { text: "Add a health check", redacted: false, attachmentCount: 0 },
    });
    const first = applyEvent(emptySnapshot(), prompt);
    const second = applyEvent(first.snapshot, prompt);
    expect(first.effect).toBe("created");
    expect(first.snapshot.tasks).toHaveLength(1);
    expect(first.snapshot.tasks[0]?.status).toBe("prompt_captured");
    expect(second.effect).toBe("duplicate");
    expect(second.snapshot.tasks).toHaveLength(1);
  });

  it("keeps an early file edit, then attaches a later prompt in the same session", () => {
    const edit = event({
      eventId: "22222222-2222-4222-8222-222222222222",
      sessionId: "s1",
      occurredAt: "2026-10-29T00:00:01.000Z",
      kind: "file.edited",
      payload: { relativePath: "src/app.ts", editCount: 1, protectedFile: false },
    });
    const prompt = event({
      eventId: "33333333-3333-4333-8333-333333333333",
      sessionId: "s1",
      occurredAt: "2026-10-29T00:00:02.000Z",
      kind: "prompt.submitted",
      payload: { text: "Rename the handler", redacted: false, attachmentCount: 0 },
    });
    const afterEdit = applyEvent(emptySnapshot(), edit);
    const afterPrompt = applyEvent(afterEdit.snapshot, prompt);
    expect(afterPrompt.snapshot.tasks).toHaveLength(1);
    expect(afterPrompt.snapshot.tasks[0]?.promptSummary).toBe("Rename the handler");
    expect(afterPrompt.snapshot.tasks[0]?.changedFiles.map((file) => file.relativePath)).toEqual(["src/app.ts"]);
    expect(afterPrompt.snapshot.tasks[0]?.status).toBe("prompt_captured");
  });

  it("starts a second task for a new prompt and isolates a second session", () => {
    let snapshot = emptySnapshot();
    snapshot = applyEvent(
      snapshot,
      event({
        sessionId: "s1",
        kind: "prompt.submitted",
        payload: { text: "First task", redacted: false, attachmentCount: 0 },
      }),
    ).snapshot;
    snapshot = applyEvent(
      snapshot,
      event({
        sessionId: "s1",
        kind: "agent.stopped",
        payload: { status: "completed", loopCount: 0 },
      }),
    ).snapshot;
    snapshot = applyEvent(
      snapshot,
      event({
        sessionId: "s1",
        kind: "prompt.submitted",
        payload: { text: "Second task", redacted: false, attachmentCount: 0 },
      }),
    ).snapshot;
    snapshot = applyEvent(
      snapshot,
      event({
        sessionId: "s2",
        kind: "file.edited",
        payload: { relativePath: "other.ts", editCount: 1, protectedFile: false },
      }),
    ).snapshot;
    const sessionOne = snapshot.tasks.filter((task) => task.sessionId === "s1");
    const sessionTwo = snapshot.tasks.filter((task) => task.sessionId === "s2");
    expect(sessionOne).toHaveLength(2);
    expect(sessionOne[1]?.promptSummary).toBe("Second task");
    expect(sessionOne[0]?.changedFiles).toEqual([]);
    expect(sessionTwo[0]?.changedFiles.map((file) => file.relativePath)).toEqual(["other.ts"]);
  });

  it("treats a short continue prompt as the same task and does not merge missing session ids", () => {
    let snapshot = emptySnapshot();
    snapshot = applyEvent(
      snapshot,
      event({
        sessionId: "s1",
        kind: "prompt.submitted",
        payload: { text: "Build the parser", redacted: false, attachmentCount: 0 },
      }),
    ).snapshot;
    snapshot = applyEvent(
      snapshot,
      event({
        sessionId: "s1",
        kind: "tool.started",
        payload: { toolName: "Write" },
      }),
    ).snapshot;
    const continued = applyEvent(
      snapshot,
      event({
        sessionId: "s1",
        kind: "prompt.submitted",
        payload: { text: "continue with the tests", redacted: false, attachmentCount: 0 },
      }),
    );
    expect(continued.snapshot.tasks).toHaveLength(1);
    expect(continued.snapshot.tasks[0]?.status).toBe("agent_working");

    const anonA = applyEvent(
      emptySnapshot(),
      event({
        kind: "file.edited",
        payload: { relativePath: "a.ts", editCount: 1, protectedFile: false },
      }),
    );
    const anonB = applyEvent(
      anonA.snapshot,
      event({
        kind: "file.edited",
        payload: { relativePath: "b.ts", editCount: 1, protectedFile: false },
      }),
    );
    expect(anonB.snapshot.tasks).toHaveLength(2);
  });
});
