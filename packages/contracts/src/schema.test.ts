import { describe, expect, it } from "vitest";
import { companionEventSchema, panelToHostSchema } from "./index";

const workspaceId = "a".repeat(24);

describe("companion events", () => {
  it("accepts a prompt event", () => {
    const parsed = companionEventSchema.parse({
      schemaVersion: 1,
      eventId: "11111111-1111-4111-8111-111111111111",
      occurredAt: "2026-10-29T00:00:00.000Z",
      source: "cursor-hook",
      workspaceId,
      sessionId: "conv-1",
      kind: "prompt.submitted",
      payload: { text: "Fix the flaky test", redacted: false, attachmentCount: 0 },
    });
    expect(parsed.kind).toBe("prompt.submitted");
  });

  it("rejects an unknown kind and a mistyped payload", () => {
    expect(
      companionEventSchema.safeParse({
        schemaVersion: 1,
        eventId: "11111111-1111-4111-8111-111111111111",
        occurredAt: "2026-10-29T00:00:00.000Z",
        source: "cursor-hook",
        workspaceId,
        kind: "agent.thought",
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      companionEventSchema.safeParse({
        schemaVersion: 1,
        eventId: "11111111-1111-4111-8111-111111111111",
        occurredAt: "2026-10-29T00:00:00.000Z",
        source: "cursor-hook",
        workspaceId,
        kind: "prompt.submitted",
        payload: { text: 12, redacted: false, attachmentCount: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("panel messages", () => {
  it("rejects an unknown panel message", () => {
    expect(panelToHostSchema.safeParse({ schemaVersion: 1, type: "steal-focus" }).success).toBe(false);
  });
});
