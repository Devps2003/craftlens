export const MANAGED_HOOKS = [
  "sessionStart",
  "beforeSubmitPrompt",
  "postToolUse",
  "postToolUseFailure",
  "afterFileEdit",
  "afterAgentResponse",
  "stop",
  "sessionEnd",
] as const;

export interface HookFile {
  version?: number;
  hooks?: Record<string, { command?: string }[]>;
}

export type Backup = { kind: "missing" } | { kind: "bytes"; text: string };

export function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function hookCommand(nodePath: string, scriptPath: string): string {
  return `${quoteShellArg(nodePath)} ${quoteShellArg(scriptPath)}`;
}

export function planInstall(
  current: string | null,
  command: string,
): { ok: true; next: string; backup: Backup } | { ok: false; reason: string } {
  if (current === null) {
    return { ok: true, next: serialize(baseFile(command)), backup: { kind: "missing" } };
  }
  let parsed: HookFile;
  try {
    parsed = JSON.parse(current) as HookFile;
  } catch {
    return { ok: false, reason: "existing hooks.json is not valid JSON; CraftLens will not overwrite it" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "hooks.json has an unexpected shape" };
  }
  const hooks = { ...(parsed.hooks ?? {}) };
  for (const name of MANAGED_HOOKS) {
    const list = Array.isArray(hooks[name]) ? [...hooks[name]] : [];
    if (!list.some((entry) => entry?.command === command)) {
      list.push({ command });
    }
    hooks[name] = list;
  }
  const next = serialize({ ...parsed, version: parsed.version ?? 1, hooks });
  return { ok: true, next, backup: { kind: "bytes", text: current } };
}

export function planUninstall(backup: Backup | null, command: string, current: string | null): 
  | { action: "delete" }
  | { action: "write"; text: string }
  | { action: "refuse"; reason: string } {
  if (backup?.kind === "missing") return { action: "delete" };
  if (backup?.kind === "bytes") return { action: "write", text: backup.text };
  if (current === null) return { action: "delete" };
  try {
    const parsed = JSON.parse(current) as HookFile;
    const hooks: Record<string, { command?: string }[]> = {};
    for (const [name, entries] of Object.entries(parsed.hooks ?? {})) {
      const kept = (entries ?? []).filter((entry) => entry?.command !== command);
      if (kept.length > 0) hooks[name] = kept;
    }
    return { action: "write", text: serialize({ ...parsed, hooks }) };
  } catch {
    return { action: "refuse", reason: "cannot uninstall without a backup because hooks.json is not valid JSON" };
  }
}

function baseFile(command: string): HookFile {
  const hooks: Record<string, { command: string }[]> = {};
  for (const name of MANAGED_HOOKS) hooks[name] = [{ command }];
  return { version: 1, hooks };
}

function serialize(value: HookFile): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
