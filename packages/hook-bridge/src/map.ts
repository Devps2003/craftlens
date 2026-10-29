import { companionEventSchema, type CompanionEventV1 } from "@craftlens/contracts";
import { hashRoots, isProtectedPath, redactSecrets, relativeToRoots } from "@craftlens/security";

export type MapResult =
  | { ok: true; event: CompanionEventV1 }
  | { ok: false; reason: string };

const ALLOWED = new Set([
  "sessionStart",
  "beforeSubmitPrompt",
  "postToolUse",
  "postToolUseFailure",
  "afterFileEdit",
  "afterAgentResponse",
  "stop",
  "sessionEnd",
]);

export function mapCursorPayload(
  raw: unknown,
  now = new Date().toISOString(),
  options: { storePrompt?: boolean } = {},
): MapResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "payload is not an object" };
  const record = raw as Record<string, unknown>;
  const hook = typeof record.hook_event_name === "string" ? record.hook_event_name : "";
  if (hook === "afterAgentThought") return { ok: false, reason: "thought events are ignored" };
  if (!ALLOWED.has(hook)) return { ok: false, reason: `unsupported hook ${hook || "missing"}` };

  const roots = Array.isArray(record.workspace_roots)
    ? record.workspace_roots.filter((item): item is string => typeof item === "string")
    : [];
  if (roots.length === 0) return { ok: false, reason: "workspace_roots missing" };
  const workspaceId = hashRoots(roots);
  const sessionId = stringField(record, "conversation_id") || stringField(record, "session_id") || undefined;
  const eventId = crypto.randomUUID();
  const base = {
    schemaVersion: 1 as const,
    eventId,
    occurredAt: now,
    source: "cursor-hook" as const,
    workspaceId,
    sessionId,
  };

  let event: CompanionEventV1;
  switch (hook) {
    case "sessionStart":
      event = companionEventSchema.parse({
        ...base,
        kind: "session.started",
        payload: {
          isBackgroundAgent: record.is_background_agent === true,
          composerMode: stringField(record, "composer_mode"),
        },
      });
      break;
    case "beforeSubmitPrompt": {
      if (typeof record.prompt !== "string") return { ok: false, reason: "prompt must be a string" };
      const prompt = options.storePrompt === false ? "" : record.prompt;
      const redacted = redactSecrets(prompt);
      const attachments = Array.isArray(record.attachments) ? record.attachments.length : 0;
      event = companionEventSchema.parse({
        ...base,
        kind: "prompt.submitted",
        payload: { text: redacted.text.slice(0, 20_000), redacted: redacted.redacted, attachmentCount: attachments },
      });
      break;
    }
    case "postToolUse":
      event = mapTool(base, record, false);
      break;
    case "postToolUseFailure":
      event = companionEventSchema.parse({
        ...base,
        kind: "tool.failed",
        payload: {
          toolName: stringField(record, "tool_name") || "unknown",
          toolUseId: stringField(record, "tool_use_id"),
          failureSummary: summarize(stringField(record, "error_message") || stringField(record, "failure_type") || "tool failed"),
        },
      });
      break;
    case "afterFileEdit": {
      const absolute = stringField(record, "file_path");
      if (!absolute) return { ok: false, reason: "file_path missing" };
      const relativePath = relativeToRoots(roots, absolute);
      if (!relativePath) return { ok: false, reason: "file is outside the workspace" };
      const edits = Array.isArray(record.edits) ? record.edits.length : 0;
      event = companionEventSchema.parse({
        ...base,
        kind: "file.edited",
        payload: { relativePath, editCount: edits, protectedFile: isProtectedPath(relativePath) },
      });
      break;
    }
    case "afterAgentResponse": {
      const text = redactSecrets(typeof record.text === "string" ? record.text : "");
      event = companionEventSchema.parse({
        ...base,
        kind: "agent.response",
        payload: { textSummary: text.text.replace(/\s+/g, " ").trim().slice(0, 500) },
      });
      break;
    }
    case "stop":
      event = companionEventSchema.parse({
        ...base,
        kind: "agent.stopped",
        payload: {
          status: record.status === "aborted" || record.status === "error" ? record.status : "completed",
          loopCount: typeof record.loop_count === "number" ? record.loop_count : 0,
        },
      });
      break;
    case "sessionEnd":
      event = companionEventSchema.parse({
        ...base,
        kind: "session.ended",
        payload: {
          reason: stringField(record, "reason") || "completed",
          durationMs: typeof record.duration_ms === "number" ? record.duration_ms : undefined,
        },
      });
      break;
    default:
      return { ok: false, reason: "unhandled" };
  }
  return { ok: true, event };
}

function mapTool(
  base: {
    schemaVersion: 1;
    eventId: string;
    occurredAt: string;
    source: "cursor-hook";
    workspaceId: string;
    sessionId?: string;
  },
  record: Record<string, unknown>,
  _failed: boolean,
): CompanionEventV1 {
  const toolName = stringField(record, "tool_name") || "unknown";
  const command = commandSummary(record.tool_input);
  const observed = observeExit(record.tool_output);
  if (observed && isTestCommand(command)) {
    return companionEventSchema.parse({
      ...base,
      kind: "test.observed",
      payload: {
        commandSummary: command,
        status: observed.exitCode === 0 ? "passed" : "failed",
        detail: `exit ${observed.exitCode}`,
      },
    });
  }
  return companionEventSchema.parse({
    ...base,
    kind: "tool.completed",
    payload: {
      toolName,
      toolUseId: stringField(record, "tool_use_id"),
      durationMs: typeof record.duration === "number" ? record.duration : undefined,
      commandSummary: command || undefined,
      outputSummary: observed ? `exit ${observed.exitCode}` : undefined,
      exitCode: observed?.exitCode,
    },
  });
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function commandSummary(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const command = (input as { command?: unknown }).command;
  if (typeof command !== "string") return "";
  const redacted = redactSecrets(command);
  return redacted.text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function observeExit(output: unknown): { exitCode: number } | null {
  if (typeof output !== "string") return null;
  try {
    const parsed = JSON.parse(output) as { exitCode?: unknown };
    if (typeof parsed.exitCode === "number") return { exitCode: parsed.exitCode };
  } catch {
    return null;
  }
  return null;
}

function isTestCommand(command: string): boolean {
  return /\b(npm test|pnpm test|yarn test|vitest|jest|pytest|go test|cargo test)\b/.test(command);
}

function summarize(value: string): string {
  return redactSecrets(value).text.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function failOpenStdout(): string {
  return `${JSON.stringify({ continue: true })}\n`;
}
