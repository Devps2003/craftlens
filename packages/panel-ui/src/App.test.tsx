import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyValidation, type PanelView } from "@craftlens/contracts";
import { App } from "./App";

const view: PanelView = {
  schemaVersion: 1,
  connection: "synthetic",
  connectionDetail: "Synthetic fixture. Live hooks are not connected.",
  privacyMode: "local-only",
  profileId: "learn",
  compact: false,
  quiet: false,
  onboarded: true,
  detail: "balanced",
  level: "intermediate",
  phase: "review",
  offline: true,
  notice: undefined,
  checklistText: "- [ ] Compare the diff",
  history: [],
  task: {
    schemaVersion: 1,
    id: "task_1",
    workspaceId: "abc123abc123abc123abc123",
    createdAt: "2026-10-29T00:00:00.000Z",
    updatedAt: "2026-10-29T00:00:00.000Z",
    status: "review_ready",
    promptSummary: "Add an SQS consumer",
    promptStored: true,
    category: "feature",
    inferredGoals: [],
    changedFiles: [{ relativePath: "src/consumer.ts", attribution: "task", binary: false, renamed: false, protected: false }],
    decisions: [],
    risks: [{
      id: "risk_1",
      createdAt: "2026-10-29T00:00:00.000Z",
      updatedAt: "2026-10-29T00:00:00.000Z",
      title: "Duplicate delivery",
      severity: "high",
      domain: "queues",
      failureMode: "A second worker posts again",
      impact: "Work runs twice",
      whyItMatters: "The queue is at-least-once",
      verification: "Replay the same message id",
      status: "open",
      confidence: "needs-confirmation",
      provenance: "knowledge:queue-delivery",
      tags: ["reliability"],
    }],
    actions: [{
      id: "action_1",
      createdAt: "2026-10-29T00:00:00.000Z",
      updatedAt: "2026-10-29T00:00:00.000Z",
      verb: "Replay the same message id",
      rationale: "Duplicates are the failure that matters.",
      effort: "quick",
      benefit: "You see whether the handler is idempotent.",
      status: "open",
      why: "The prompt is about a consumer.",
      provenance: "knowledge:queue-delivery",
      tags: ["reliability"],
    }],
    validation: {
      ...emptyValidation(),
      git: { state: "no-git", summary: "Git is not available." },
    },
    analysisStatus: "complete",
    profileId: "learn",
    gitBaseline: { captured: false, paths: [] },
    analysisMeta: { provider: "offline", privacyMode: "local-only", requestCount: 0, contextSources: [] },
  },
};

afterEach(() => cleanup());

describe("panel", () => {
  it("renders review ready and sends a keyboard-reachable action", async () => {
    const onMessage = vi.fn();
    render(<App view={view} onMessage={onMessage} />);
    expect(screen.getByRole("status").textContent).toBe("Review ready");
    expect(screen.getAllByText(/Not observed/).length).toBeGreaterThan(0);
    const button = screen.getByRole("button", { name: "Mark complete" });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onMessage).toHaveBeenCalled();
  });

  it("shows onboarding before a profile exists and the disconnected empty state", () => {
    const first = render(<App view={{ ...view, onboarded: false, task: null, phase: "empty" }} onMessage={() => undefined} />);
    expect(screen.getByRole("form", { name: "CraftLens onboarding" })).toBeTruthy();
    first.unmount();
    render(<App view={{ ...view, task: null, phase: "disconnected" }} onMessage={() => undefined} />);
    expect(screen.getByRole("status").textContent).toBe("Live events disconnected");
  });
});
