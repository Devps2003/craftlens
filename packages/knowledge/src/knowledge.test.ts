import { describe, expect, it } from "vitest";
import { loadPrinciples, selectPrinciples } from "./index";

describe("knowledge packs", () => {
  it("validates built-in packs and keeps at most three relevant principles", () => {
    const principles = loadPrinciples();
    expect(principles.length).toBeGreaterThanOrEqual(9);
    const picked = selectPrinciples({
      principles,
      text: "add an sqs consumer with retry and idempotency",
      paths: ["src/consumer.ts"],
      category: "feature",
      dismissedIds: ["queue-visibility"],
    });
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(picked.some((item) => item.id === "queue-delivery")).toBe(true);
    expect(picked.some((item) => item.id === "queue-visibility")).toBe(false);
  });

  it("rejects a pack that is missing a failure mode", () => {
    expect(() => loadPrinciples([{ id: "x" }])).toThrow();
  });
});
