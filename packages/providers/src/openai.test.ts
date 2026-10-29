import { describe, expect, it, vi } from "vitest";
import { analysisResultSchema } from "@craftlens/contracts";
import { createOpenAiCompatibleProvider, type FetchLike } from "./index";

const valid = analysisResultSchema.parse({
  summary: "Queue consumer review",
  observedFacts: [],
  decisions: [],
  alternatives: [],
  risks: [
    {
      id: "risk_test",
      createdAt: "2026-10-29T00:00:00.000Z",
      updatedAt: "2026-10-29T00:00:00.000Z",
      title: "Duplicate delivery",
      severity: "high",
      domain: "queues",
      failureMode: "A retry posts a second payout",
      impact: "Money moves twice",
      whyItMatters: "The queue is at-least-once",
      verification: "Replay the same message id",
      status: "open",
      confidence: "verified",
      provenance: "model",
      tags: ["payments"],
    },
  ],
  nextActions: [],
  validationChecks: [],
  unknowns: [],
  evidence: [],
  analysisMetadata: {
    provider: "openai-compatible",
    at: "2026-10-29T00:00:00.000Z",
    contextSources: ["prompt"],
    privacyMode: "prompt-summary",
    durationMs: 5,
  },
});

function jsonResponse(content: string, status = 200): { ok: boolean; status: number; text: () => Promise<string> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  };
}

describe("openai-compatible provider", () => {
  it("repairs malformed output once and scrubs the key from errors", async () => {
    const key = "sk-testsecretvalue123456789";
    const fetchImpl = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse("{"))
      .mockResolvedValueOnce(jsonResponse(JSON.stringify(valid)));
    const provider = createOpenAiCompatibleProvider(fetchImpl);
    const result = await provider.analyze(
      {
        promptSummary: "retry payouts",
        category: "feature",
        files: [],
        privacyMode: "prompt-summary",
        allowedContext: "summary",
      },
      { timeoutMs: 1000, model: "test", apiKey: key, baseUrl: "https://example.invalid/v1" },
      new AbortController().signal,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.summary).toBe("Queue consumer review");
    expect(JSON.stringify(result)).not.toContain(key);

    const failing = vi.fn<FetchLike>().mockRejectedValue(new Error(`network ${key}`));
    await expect(
      createOpenAiCompatibleProvider(failing).analyze(
        {
          promptSummary: "retry payouts",
          category: "feature",
          files: [],
          privacyMode: "prompt-summary",
          allowedContext: "summary",
        },
        { timeoutMs: 1000, model: "test", apiKey: key, baseUrl: "https://example.invalid/v1" },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/\[redacted\]/);
  });

  it("does not repair a rate limit and rejects an empty key", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse("nope", 429));
    await expect(
      createOpenAiCompatibleProvider(fetchImpl).analyze(
        {
          promptSummary: "x",
          category: "unknown",
          files: [],
          privacyMode: "diff-snippets",
          allowedContext: "diff",
        },
        { timeoutMs: 1000, model: "test", apiKey: "sk-test", baseUrl: "https://example.invalid/v1" },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/rate limit/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const check = await createOpenAiCompatibleProvider(fetchImpl).validateConfig({ baseUrl: "https://example.invalid", apiKey: "" });
    expect(check.ok).toBe(false);
  });
});
