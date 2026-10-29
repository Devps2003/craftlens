import { describe, expect, it, vi } from "vitest";
import { emptyValidation, type TaskRecordV1 } from "@craftlens/contracts";
import { AnalysisScheduler, analyzeTask, classifyTask } from "./index";

const workspaceId = "abc123abc123abc123abc123";

function task(prompt: string, status: TaskRecordV1["status"] = "prompt_captured"): TaskRecordV1 {
  return {
    schemaVersion: 1,
    id: "task_1",
    workspaceId,
    createdAt: "2026-10-29T00:00:00.000Z",
    updatedAt: "2026-10-29T00:00:00.000Z",
    status,
    promptSummary: prompt,
    promptStored: true,
    category: "unknown",
    inferredGoals: [],
    changedFiles: [],
    decisions: [],
    risks: [],
    actions: [],
    validation: emptyValidation(),
    analysisStatus: "not-started",
    profileId: "learn",
    gitBaseline: { captured: false, paths: [], limitation: "not captured" },
    analysisMeta: { provider: "offline", privacyMode: "local-only", requestCount: 0, contextSources: [] },
  };
}

describe("offline analysis", () => {
  it("does not keep a provider verified label without observed evidence", async () => {
    const outcome = await analyzeTask({
      task: task("Add an SQS consumer", "completion_detected"),
      profileId: "senior-reviewer",
      privacyMode: "prompt-summary",
      apiKey: "sk-test",
      baseUrl: "https://example.invalid/v1",
      model: "test",
      dismissedPrincipleIds: [],
      signal: new AbortController().signal,
      now: "2026-10-29T00:00:03.000Z",
      provider: {
        id: "fake",
        capabilities: { structuredOutput: true, streaming: false, local: false },
        validateConfig: async () => ({ ok: true, message: "ok" }),
        analyze: async () => ({
          summary: "model",
          observedFacts: [
            {
              id: "goal_model",
              text: "Tests passed",
              status: "verified",
              evidence: [{ id: "e", label: "model", kind: "event", available: true }],
            },
          ],
          decisions: [],
          alternatives: [],
          risks: [
            {
              id: "risk_model",
              createdAt: "2026-10-29T00:00:00.000Z",
              updatedAt: "2026-10-29T00:00:00.000Z",
              title: "Duplicate delivery",
              severity: "high",
              domain: "queues",
              failureMode: "Second payout",
              impact: "Money moves twice",
              whyItMatters: "At-least-once delivery",
              verification: "Replay one message id",
              status: "open",
              confidence: "verified",
              provenance: "model",
              tags: [],
            },
          ],
          nextActions: [],
          validationChecks: [],
          unknowns: [],
          evidence: [],
          analysisMetadata: {
            provider: "fake",
            at: "2026-10-29T00:00:03.000Z",
            contextSources: ["prompt"],
            privacyMode: "prompt-summary",
            durationMs: 1,
          },
        }),
      },
    });
    expect(outcome.fallback).toBe(false);
    expect(outcome.task.risks[0]?.confidence).toBe("needs-confirmation");
    expect(outcome.task.inferredGoals[0]?.status).not.toBe("verified");
  });

  it("classifies a queue prompt and does not mark risks verified", async () => {
    const outcome = await analyzeTask({
      task: task("Add an SQS consumer with retry and idempotency"),
      profileId: "learn",
      privacyMode: "local-only",
      provider: null,
      apiKey: "sk-should-not-be-used",
      baseUrl: "https://example.invalid",
      model: "test",
      dismissedPrincipleIds: [],
      signal: new AbortController().signal,
      now: "2026-10-29T00:00:01.000Z",
    });
    expect(outcome.fallback).toBe(true);
    expect(outcome.requests).toBe(0);
    expect(outcome.task.category).toBe("feature");
    expect(classifyTask("fix the failing parser", [])).toBe("bug_fix");
    expect(outcome.task.risks.length).toBeGreaterThan(0);
    expect(outcome.task.risks.length).toBeLessThanOrEqual(3);
    expect(outcome.task.risks.every((risk) => risk.confidence !== "verified")).toBe(true);
    expect(outcome.task.actions[0]?.verb.length).toBeGreaterThan(0);
    expect(JSON.stringify(outcome.task)).not.toContain("sk-should-not-be-used");
    expect(outcome.task.validation.tests.every((row) => row.status !== "passed")).toBe(true);
  });

  it("turns a completed task into review ready and keeps a docs change quiet of false passes", async () => {
    const outcome = await analyzeTask({
      task: {
        ...task("Update the README for the health check", "completion_detected"),
        changedFiles: [
          { relativePath: "README.md", attribution: "task", binary: false, renamed: false, protected: false },
        ],
      },
      profileId: "minimal-noise",
      privacyMode: "local-only",
      provider: null,
      apiKey: "",
      baseUrl: "",
      model: "",
      dismissedPrincipleIds: [],
      signal: new AbortController().signal,
      now: "2026-10-29T00:00:02.000Z",
    });
    expect(outcome.task.status).toBe("review_ready");
    expect(outcome.task.category).toBe("docs");
    expect(outcome.task.validation.remainingChecks.some((check) => /no test result was observed/i.test(check))).toBe(true);
  });

  it("debounces edit storms and then caps provider-sized follow-ups", async () => {
    vi.useFakeTimers();
    const scheduler = new AnalysisScheduler(400, 2);
    let runs = 0;
    expect(scheduler.schedule("task", () => { runs += 1; })).toBe("scheduled");
    expect(scheduler.schedule("task", () => { runs += 1; })).toBe("scheduled");
    await vi.advanceTimersByTimeAsync(400);
    expect(runs).toBe(1);
    expect(scheduler.schedule("task", () => { runs += 1; })).toBe("scheduled");
    await vi.advanceTimersByTimeAsync(400);
    expect(runs).toBe(2);
    expect(scheduler.schedule("task", () => { runs += 1; })).toBe("capped");
    vi.useRealTimers();
  });
});
