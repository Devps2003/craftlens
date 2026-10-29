import {
  type CompanionEventV1,
  type TaskRecordV1,
  type TaskStatus,
  emptyValidation,
} from "@craftlens/contracts";

export interface EngineSnapshot {
  tasks: TaskRecordV1[];
  seenEventIds: string[];
}

export interface ApplyOutcome {
  snapshot: EngineSnapshot;
  effect: "duplicate" | "created" | "updated";
  taskId?: string;
}

const CONTINUATION = /^(continue|go on|keep going|yes|do that|carry on)\b/i;
const OPEN_FOR_CONTINUATION = new Set<TaskStatus>([
  "prompt_captured",
  "brief_generating",
  "agent_working",
  "evidence_accumulating",
]);

export function emptySnapshot(): EngineSnapshot {
  return { tasks: [], seenEventIds: [] };
}

export function applyEvent(snapshot: EngineSnapshot, event: CompanionEventV1): ApplyOutcome {
  if (snapshot.seenEventIds.includes(event.eventId)) {
    return { snapshot, effect: "duplicate" };
  }
  const seenEventIds = [...snapshot.seenEventIds, event.eventId].slice(-5000);
  const tasks = snapshot.tasks.map((task) => ({ ...task }));
  const target = selectTask(tasks, event);
  if (target.created) tasks.push(target.task);
  const next = reduceTask(target.task, event);
  const index = tasks.findIndex((task) => task.id === next.id);
  tasks[index] = next;
  return {
    snapshot: { tasks, seenEventIds },
    effect: target.created ? "created" : "updated",
    taskId: next.id,
  };
}

function selectTask(
  tasks: TaskRecordV1[],
  event: CompanionEventV1,
): { task: TaskRecordV1; created: boolean } {
  if (event.taskId) {
    const byId = [...tasks].reverse().find((task) => task.id === event.taskId);
    if (byId) return { task: byId, created: false };
  }
  const inSession = event.sessionId
    ? [...tasks].reverse().find((task) => task.sessionId === event.sessionId)
    : undefined;

  if (event.kind === "prompt.submitted") {
    const text = event.payload.text.trim();
    if (inSession && inSession.promptSummary.length === 0) {
      return { task: inSession, created: false };
    }
    if (inSession && OPEN_FOR_CONTINUATION.has(inSession.status) && CONTINUATION.test(text)) {
      return { task: inSession, created: false };
    }
    return { task: createTask(event), created: true };
  }

  if (inSession) return { task: inSession, created: false };
  return { task: createTask(event), created: true };
}

function createTask(event: CompanionEventV1): TaskRecordV1 {
  return {
    schemaVersion: 1,
    id: event.taskId ?? `task_${event.eventId}`,
    workspaceId: event.workspaceId,
    sessionId: event.sessionId,
    createdAt: event.occurredAt,
    updatedAt: event.occurredAt,
    status: "unknown",
    promptSummary: "",
    promptStored: false,
    category: "unknown",
    inferredGoals: [],
    changedFiles: [],
    decisions: [],
    risks: [],
    actions: [],
    validation: emptyValidation(),
    analysisStatus: "not-started",
    profileId: "learn",
    gitBaseline: { captured: false, paths: [] },
    analysisMeta: {
      provider: "offline",
      privacyMode: "local-only",
      requestCount: 0,
      contextSources: [],
    },
  };
}

function reduceTask(task: TaskRecordV1, event: CompanionEventV1): TaskRecordV1 {
  const next: TaskRecordV1 = {
    ...task,
    updatedAt: event.occurredAt,
    status: nextStatus(task.status, event),
    changedFiles: [...task.changedFiles],
    validation: {
      ...task.validation,
      changedFiles: [...task.validation.changedFiles],
      tests: [...task.validation.tests],
      acceptance: [...task.validation.acceptance],
      remainingChecks: [...task.validation.remainingChecks],
    },
  };

  switch (event.kind) {
    case "prompt.submitted": {
      const text = event.payload.text.replace(/\s+/g, " ").trim();
      next.promptSummary = text.slice(0, 280);
      next.promptStored = text.length > 0;
      if (task.promptSummary.length === 0) next.status = "prompt_captured";
      break;
    }
    case "file.edited": {
      if (!next.changedFiles.some((file) => file.relativePath === event.payload.relativePath)) {
        next.changedFiles.push({
          relativePath: event.payload.relativePath,
          attribution: "unknown",
          binary: false,
          renamed: false,
          protected: event.payload.protectedFile,
        });
      }
      break;
    }
    case "test.observed": {
      next.validation.tests.push({
        id: `test_${event.eventId}`,
        commandSummary: event.payload.commandSummary,
        status: event.payload.status,
        detail: event.payload.detail,
      });
      break;
    }
    case "diagnostic.changed": {
      next.validation.diagnostics = {
        state: "observed",
        errorCount: event.payload.errorCount,
        warningCount: event.payload.warningCount,
      };
      break;
    }
    case "git.diff.changed": {
      next.validation.git = {
        state: event.payload.available ? "available" : "unavailable",
        summary: event.payload.summary,
        limitation: event.payload.limitation,
      };
      break;
    }
    case "user.action": {
      if (event.payload.action === "pause") next.status = "paused";
      if (event.payload.action === "resume") {
        next.status = next.changedFiles.length > 0 ? "evidence_accumulating" : "prompt_captured";
      }
      break;
    }
    default:
      break;
  }
  next.validation.changedFiles = next.changedFiles;
  return next;
}

function nextStatus(current: TaskStatus, event: CompanionEventV1): TaskStatus {
  if (event.kind === "user.action") return current;
  if (current === "paused" || current === "error") return current;
  switch (event.kind) {
    case "prompt.submitted":
      return current === "unknown" || current === "idle" ? "prompt_captured" : current;
    case "tool.started":
      return "agent_working";
    case "file.edited":
    case "tool.completed":
    case "tool.failed":
    case "agent.response":
    case "diagnostic.changed":
    case "test.observed":
    case "git.diff.changed":
      if (current === "review_ready" || current === "waiting_for_engineer" || current === "completion_detected") {
        return current;
      }
      return "evidence_accumulating";
    case "agent.stopped":
    case "session.ended":
      return "completion_detected";
    default:
      return current === "idle" ? "unknown" : current;
  }
}
