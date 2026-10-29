import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeTask, AnalysisScheduler } from "@craftlens/analysis";
import { attributeFiles, captureBaseline, captureDiff, type GitRunner } from "@craftlens/context";
import {
  DEFAULT_SETTINGS,
  companionEventSchema,
  panelToHostSchema,
  panelViewSchema,
  type CompanionEventV1,
  type PanelView,
  type TaskRecordV1,
  type UserSettings,
} from "@craftlens/contracts";
import { applyEvent, emptySnapshot, resolveSettings, settingsFromOnboarding, toPanelView, type EngineSnapshot } from "@craftlens/core";
import { createOpenAiCompatibleProvider, type FreeLlmEndpoint } from "@craftlens/providers";
import { isProtectedPath, resolveInsideWorkspace } from "@craftlens/security";
import { createFileStore, type FeedbackEntry, type TaskStore } from "@craftlens/storage";

export interface ControllerOptions {
  workspaceId: string;
  roots: string[];
  dataRoot: string;
  git?: GitRunner;
  now?: () => string;
  captureFile?: string;
  discover?: () => Promise<FreeLlmEndpoint | null>;
}

export class CraftLensController {
  private snapshot: EngineSnapshot = emptySnapshot();
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
  private readonly store: TaskStore;
  private readonly scheduler = new AnalysisScheduler(400, 3);
  private search = "";
  private notice: string | undefined;
  private pinnedTaskId: string | undefined;
  private selectedTaskId: string | undefined;
  private hooksInstalled = false;
  private synthetic = false;
  private abort: AbortController | null = null;
  private listener: (() => void) | null = null;
  private endpoint: FreeLlmEndpoint | null = null;
  apiKey = "";

  constructor(private readonly options: ControllerOptions) {
    this.store = createFileStore(options.dataRoot, this.settings.retentionDays);
  }

  onChange(listener: () => void): void {
    this.listener = listener;
  }

  setHooksInstalled(installed: boolean): void {
    this.hooksInstalled = installed;
    if (installed) this.synthetic = false;
    this.emit();
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.emit();
  }

  updateSettings(user: UserSettings, workspace?: Partial<UserSettings>): void {
    this.settings = resolveSettings(user, workspace);
    void this.writeCapture();
    this.emit();
  }

  getSettings(): UserSettings {
    return { ...this.settings };
  }

  async prepare(): Promise<void> {
    await this.resolveEndpoint();
    this.emit();
  }

  async restore(): Promise<void> {
    const tasks = await this.store.loadTasks(this.options.workspaceId);
    this.snapshot = { tasks, seenEventIds: [] };
    this.emit();
  }

  view(): PanelView {
    const view = toPanelView(this.snapshot, {
      settings: this.settings,
      connection: this.connection(),
      connectionDetail: this.connectionDetail(),
      offline: this.isOffline(),
      pinnedTaskId: this.pinnedTaskId,
      selectedTaskId: this.selectedTaskId,
      search: this.search,
      notice: this.notice,
    });
    return panelViewSchema.parse(view);
  }

  async handle(message: unknown): Promise<{ clipboard?: string; openPath?: string; exportText?: string }> {
    const parsed = panelToHostSchema.safeParse(message);
    if (!parsed.success) {
      this.notice = "Ignored an invalid panel message.";
      this.emit();
      return {};
    }
    const command = parsed.data;
    switch (command.type) {
      case "ready":
        return {};
      case "toggle-compact":
        this.settings = { ...this.settings, compact: !this.settings.compact };
        break;
      case "toggle-quiet":
        this.settings = { ...this.settings, quiet: !this.settings.quiet };
        break;
      case "pause":
        await this.userAction("pause");
        break;
      case "resume":
        await this.userAction("resume");
        break;
      case "reanalyze":
        await this.reanalyze();
        break;
      case "load-synthetic":
        await this.loadSynthetic();
        break;
      case "clear-data":
        await this.clear();
        break;
      case "search":
        this.search = command.query;
        break;
      case "delete-task":
        await this.store.deleteTask(this.options.workspaceId, command.taskId);
        this.snapshot = { ...this.snapshot, tasks: this.snapshot.tasks.filter((task) => task.id !== command.taskId) };
        break;
      case "export":
        this.emit();
        return { exportText: await this.store.exportWorkspace(this.options.workspaceId) };
      case "select-task":
        this.selectedTaskId = command.taskId;
        break;
      case "pin": {
        const current = this.currentTaskId();
        this.pinnedTaskId = this.pinnedTaskId === current ? undefined : current;
        break;
      }
      case "action":
        await this.setActionStatus(command.taskId, command.cardId, command.status);
        break;
      case "feedback":
        await this.feedback(command.taskId, command.cardId, command.useful, command.note);
        break;
      case "onboarding":
        this.settings = settingsFromOnboarding(command.answers);
        await this.writeCapture();
        break;
      case "open-file": {
        const openPath = resolveInsideWorkspace(this.options.roots, command.path);
        if (!openPath) this.notice = "That path is outside the workspace.";
        this.emit();
        return openPath ? { openPath } : {};
      }
      case "copy-checklist":
        this.emit();
        return { clipboard: this.view().checklistText };
      default:
        break;
    }
    this.emit();
    return {};
  }

  async ingest(raw: unknown, analyze = true): Promise<void> {
    const parsed = companionEventSchema.safeParse(raw);
    if (!parsed.success) {
      this.notice = "Dropped a malformed event.";
      this.emit();
      return;
    }
    if (parsed.data.workspaceId !== this.options.workspaceId) return;
    const applied = applyEvent(this.snapshot, parsed.data);
    this.snapshot = applied.snapshot;
    if (!applied.taskId || applied.effect === "duplicate") {
      this.emit();
      return;
    }
    if (parsed.data.kind === "prompt.submitted") await this.decorateGit(applied.taskId, "baseline");
    if (parsed.data.kind === "agent.stopped") await this.decorateGit(applied.taskId, "diff");
    await this.persist(applied.taskId);
    if (!analyze) {
      this.emit();
      return;
    }
    if (parsed.data.kind === "prompt.submitted" || parsed.data.kind === "agent.stopped") {
      this.scheduler.cancel();
      await this.runAnalysis(applied.taskId);
      return;
    }
    if (parsed.data.kind === "file.edited" || parsed.data.kind === "test.observed" || parsed.data.kind === "diagnostic.changed") {
      this.scheduler.schedule(applied.taskId, () => {
        void this.runAnalysis(applied.taskId!);
      });
    }
    this.emit();
  }

  async loadSynthetic(): Promise<void> {
    this.synthetic = true;
    this.hooksInstalled = false;
    const sessionId = "synthetic-session";
    const now = this.now();
    await this.ingest(this.event(now, sessionId, "prompt.submitted", {
      text: "Add an SQS consumer with retry and idempotency for payout capture",
      redacted: false,
      attachmentCount: 0,
    }));
    await this.ingest(this.event(now, sessionId, "file.edited", {
      relativePath: "src/consumer.ts",
      editCount: 1,
      protectedFile: false,
    }), false);
    await this.ingest(this.event(now, sessionId, "agent.stopped", { status: "completed", loopCount: 0 }));
    this.notice = "Synthetic task. This is not a live Cursor session.";
    this.emit();
  }

  async explainSelection(text: string, mode: "tradeoff" | "verify"): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      this.notice = "Nothing is selected.";
      this.emit();
      return;
    }
    const taskId = this.currentTaskId();
    if (!taskId) {
      this.notice = "Open or load a task before asking about a selection.";
      this.emit();
      return;
    }
    const task = this.task(taskId);
    if (!task) return;
    const card = {
      id: `selection_${randomUUID()}`,
      createdAt: this.now(),
      updatedAt: this.now(),
      title: mode === "tradeoff" ? "Trade-off for the selection" : "What to verify in the selection",
      rationale:
        mode === "tradeoff"
          ? `The selection is data, not a verdict. Compare it with the prompt: ${trimmed.slice(0, 180)}`
          : `Check one observable outcome of this selection: ${trimmed.slice(0, 180)}`,
      alternatives: ["Leave it until the diff shows a concrete behavior"],
      status: "likely" as const,
      provenance: "user selection",
      tags: ["selection"],
      evidence: [{ id: `sel_${taskId}`, label: "Editor selection", kind: "user" as const, available: true }],
    };
    this.replace({ ...task, decisions: [...task.decisions, card], updatedAt: this.now() });
    await this.persist(taskId);
    this.emit();
  }

  private async reanalyze(): Promise<void> {
    const taskId = this.currentTaskId();
    if (!taskId) return;
    this.abort?.abort();
    await this.runAnalysis(taskId);
  }

  private async runAnalysis(taskId: string): Promise<void> {
    const task = this.task(taskId);
    if (!task || task.status === "paused") return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const feedback = await this.store.readFeedback(this.options.workspaceId);
    const dismissed = feedback.filter((entry) => !entry.useful && entry.principleId).map((entry) => entry.principleId!);
    const endpoint = await this.resolveEndpoint();
    try {
      const outcome = await analyzeTask({
        task,
        profileId: this.settings.profileId,
        privacyMode: endpoint ? "prompt-summary" : "local-only",
        provider: endpoint ? createOpenAiCompatibleProvider() : null,
        apiKey: endpoint?.apiKey ?? "",
        baseUrl: endpoint?.baseUrl ?? "",
        model: endpoint?.model ?? "auto",
        dismissedPrincipleIds: dismissed,
        signal: abort.signal,
        now: this.now(),
      });
      if (abort.signal.aborted) return;
      const current = this.task(taskId);
      if (!current) return;
      this.replace({ ...outcome.task, changedFiles: current.changedFiles, validation: { ...outcome.task.validation, git: current.validation.git, diagnostics: current.validation.diagnostics, tests: current.validation.tests, changedFiles: current.changedFiles } });
      await this.persist(taskId);
    } catch (error) {
      this.notice = error instanceof Error ? error.message : "Analysis failed.";
    }
    this.emit();
  }

  private async decorateGit(taskId: string, kind: "baseline" | "diff"): Promise<void> {
    const task = this.task(taskId);
    const root = this.options.roots[0];
    const git = this.options.git;
    if (!task || !root || !git) return;
    if (kind === "baseline") {
      const baseline = await captureBaseline(git, root);
      this.replace({
        ...task,
        gitBaseline: { captured: baseline.state === "available", paths: baseline.paths, limitation: baseline.limitation },
        validation: {
          ...task.validation,
          git: { state: baseline.state, summary: baseline.limitation ?? "Baseline captured from git status.", limitation: baseline.limitation },
        },
      });
      return;
    }
    const diff = await captureDiff(git, root);
    const files = attributeFiles({
      baselinePaths: task.gitBaseline.paths,
      hookPaths: task.changedFiles.map((file) => file.relativePath),
      porcelain: diff.porcelain,
      gitState: diff.state,
      binaryPaths: diff.binaryPaths,
    }).map((file) => ({
      ...file,
      protected: task.changedFiles.find((existing) => existing.relativePath === file.relativePath)?.protected ?? isProtectedPath(file.relativePath),
    }));
    this.replace({
      ...task,
      changedFiles: files,
      validation: { ...task.validation, git: { state: diff.state, summary: diff.summary, limitation: diff.limitation }, changedFiles: files },
    });
  }

  private async feedback(taskId: string, cardId: string, useful: boolean, note?: string): Promise<void> {
    const task = this.task(taskId);
    if (!task) return;
    const risk = task.risks.find((item) => item.id === cardId);
    const entries = await this.store.readFeedback(this.options.workspaceId);
    const entry: FeedbackEntry = {
      workspaceId: this.options.workspaceId,
      taskId,
      cardId,
      principleId: risk?.principleId,
      useful,
      note,
      at: this.now(),
    };
    await this.store.writeFeedback(this.options.workspaceId, [...entries, entry]);
    if (!useful && risk) {
      this.replace({
        ...task,
        risks: task.risks.map((item) => (item.id === cardId ? { ...item, status: "dismissed" } : item)),
      });
      await this.persist(taskId);
    }
  }

  private async setActionStatus(taskId: string, cardId: string, status: "done" | "snoozed" | "not-applicable" | "open"): Promise<void> {
    const task = this.task(taskId);
    if (!task) return;
    this.replace({
      ...task,
      actions: task.actions.map((action) => (action.id === cardId ? { ...action, status, updatedAt: this.now() } : action)),
    });
    await this.persist(taskId);
  }

  private async userAction(action: "pause" | "resume"): Promise<void> {
    const taskId = this.currentTaskId();
    if (!taskId) return;
    await this.ingest(this.event(this.now(), this.task(taskId)?.sessionId, "user.action", { action }, taskId), false);
  }

  private async clear(): Promise<void> {
    this.abort?.abort();
    this.scheduler.cancel();
    await this.store.deleteWorkspace(this.options.workspaceId);
    this.snapshot = emptySnapshot();
    this.synthetic = false;
    this.pinnedTaskId = undefined;
    this.selectedTaskId = undefined;
    this.notice = "Local task data for this workspace was deleted.";
  }

  private async persist(taskId: string): Promise<void> {
    if (this.settings.persistence !== "local") return;
    const task = this.task(taskId);
    if (!task) return;
    await this.store.saveTask(task);
  }

  private async writeCapture(): Promise<void> {
    if (!this.options.captureFile) return;
    await mkdir(path.dirname(this.options.captureFile), { recursive: true });
    await writeFile(this.options.captureFile, JSON.stringify({ storePrompt: this.settings.persistence !== "off" }), "utf8");
  }

  private task(taskId: string): TaskRecordV1 | undefined {
    return this.snapshot.tasks.find((item) => item.id === taskId);
  }

  private replace(task: TaskRecordV1): void {
    this.snapshot = {
      ...this.snapshot,
      tasks: this.snapshot.tasks.map((item) => (item.id === task.id ? task : item)),
    };
  }

  private currentTaskId(): string | undefined {
    return this.selectedTaskId ?? this.pinnedTaskId ?? this.snapshot.tasks[this.snapshot.tasks.length - 1]?.id;
  }

  private connection(): PanelView["connection"] {
    if (this.synthetic) return "synthetic";
    if (this.hooksInstalled) return "live";
    if (this.snapshot.tasks.length > 0) return "manual";
    return "disconnected";
  }

  private connectionDetail(): string {
    if (this.synthetic) return "Synthetic fixture. Live hooks are not connected.";
    if (this.hooksInstalled) return "Local IDE hooks are installed. Cloud agents do not load user hooks.";
    return "Live events disconnected. Install hooks or load a synthetic task.";
  }

  private async resolveEndpoint(): Promise<FreeLlmEndpoint | null> {
    if (this.settings.privacyMode === "local-only") {
      this.endpoint = null;
      return null;
    }
    if (this.apiKey && this.settings.providerBaseUrl) {
      this.endpoint = { baseUrl: this.settings.providerBaseUrl, apiKey: this.apiKey, model: "auto" };
      return this.endpoint;
    }
    if (!this.options.discover) {
      this.endpoint = null;
      return null;
    }
    this.endpoint = await this.options.discover();
    return this.endpoint;
  }

  private isOffline(): boolean {
    return this.settings.privacyMode === "local-only" || !this.endpoint;
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }

  private event(
    occurredAt: string,
    sessionId: string | undefined,
    kind: CompanionEventV1["kind"],
    payload: CompanionEventV1["payload"],
    taskId?: string,
  ): CompanionEventV1 {
    return companionEventSchema.parse({
      schemaVersion: 1,
      eventId: randomUUID(),
      occurredAt,
      source: this.synthetic ? "user" : "cursor-hook",
      workspaceId: this.options.workspaceId,
      sessionId,
      taskId,
      kind,
      payload,
    });
  }

  private emit(): void {
    this.listener?.();
  }
}
