import type { EngineSnapshot } from "./engine";
import type { PanelView, TaskRecordV1, UserSettings } from "@craftlens/contracts";

export interface PanelOptions {
  settings: UserSettings;
  connection: PanelView["connection"];
  connectionDetail: string;
  offline: boolean;
  pinnedTaskId?: string;
  selectedTaskId?: string;
  search: string;
  notice?: string;
}

export function toPanelView(snapshot: EngineSnapshot, options: PanelOptions): PanelView {
  const query = options.search.trim().toLowerCase();
  const history = [...snapshot.tasks]
    .reverse()
    .filter((task) => {
      if (!query) return true;
      return `${task.promptSummary} ${task.category} ${task.status}`.toLowerCase().includes(query);
    })
    .map((task) => ({
      id: task.id,
      title: task.promptSummary || "Untitled task",
      status: task.status,
      updatedAt: task.updatedAt,
      pinned: task.id === options.pinnedTaskId,
    }));

  const task = pickTask(snapshot.tasks, options);
  const shaped = task ? presentTask(task, options.settings) : null;
  return {
    schemaVersion: 1,
    connection: options.connection,
    connectionDetail: options.connectionDetail,
    privacyMode: options.settings.privacyMode,
    profileId: options.settings.profileId,
    compact: options.settings.compact,
    quiet: options.settings.quiet || options.settings.interruption === "quiet",
    onboarded: options.settings.onboarded,
    detail: options.settings.detail,
    level: options.settings.level,
    phase: phaseFor(shaped, options),
    offline: options.offline,
    task: shaped,
    history,
    notice: options.notice,
    checklistText: checklist(shaped),
  };
}

function pickTask(tasks: TaskRecordV1[], options: PanelOptions): TaskRecordV1 | null {
  const byId = (id?: string) => tasks.find((task) => task.id === id) ?? null;
  return byId(options.selectedTaskId) ?? byId(options.pinnedTaskId) ?? tasks[tasks.length - 1] ?? null;
}

function presentTask(task: TaskRecordV1, settings: UserSettings): TaskRecordV1 {
  const quiet = settings.quiet || settings.interruption === "quiet" || settings.profileId === "minimal-noise";
  let risks = task.risks.filter((risk) => risk.status === "open" || risk.status === "validated");
  if (quiet || settings.profileId === "minimal-noise") {
    risks = risks.filter((risk) => risk.severity === "high").slice(0, 1);
  } else {
    risks = risks.slice(0, 3);
  }
  let decisions = task.decisions;
  if (quiet || settings.profileId === "senior-reviewer" || settings.profileId === "minimal-noise") {
    decisions = decisions.filter((card) => !card.tags.includes("learning"));
  }
  let actions = task.actions.filter((action) => action.status === "open" || action.status === "snoozed");
  if (quiet || settings.profileId === "minimal-noise") actions = actions.slice(0, 1);
  const clip = settings.detail === "concise" ? 160 : settings.detail === "deep" ? 2000 : 400;
  return {
    ...task,
    risks,
    decisions: decisions.map((card) => ({ ...card, rationale: card.rationale.slice(0, clip) })),
    actions,
  };
}

function phaseFor(task: TaskRecordV1 | null, options: PanelOptions): PanelView["phase"] {
  if (!task) {
    if (options.connection === "disconnected") return "disconnected";
    if (options.offline) return "offline";
    return "empty";
  }
  switch (task.status) {
    case "paused":
      return "paused";
    case "error":
      return "error";
    case "review_ready":
      return "review";
    case "waiting_for_engineer":
      return "waiting";
    case "prompt_captured":
    case "brief_generating":
      return "preparing";
    case "agent_working":
    case "evidence_accumulating":
    case "completion_detected":
    case "review_generating":
      return "working";
    default:
      return options.connection === "disconnected" ? "disconnected" : "empty";
  }
}

function checklist(task: TaskRecordV1 | null): string {
  if (!task) return "";
  const lines = [
    ...task.actions.map((action) => `- [ ] ${action.verb}`),
    ...task.validation.remainingChecks.map((check) => `- [ ] ${check}`),
  ];
  return lines.join("\n");
}
