# Cursor hook capability matrix

Sources checked on 2026-10-29:

- https://cursor.com/docs/hooks
- https://cursor.com/docs/plugins
- https://cursor.com/help/customization/extensions

This file records what those pages say and what this machine actually exercised. A documented field is not a live capture.

## Host under test

| Item | Value |
| --- | --- |
| OS | macOS 26.5 (Build 25F71), arm64 |
| Cursor | 3.27.22 (`b1aa50cb6db84fd3e8c808259cb172ea73425c10`) |
| Node used to run the spike | v26.5.0 |
| VS Code-compatible host | Not installed as a separate `code` binary in this session. The extension targets the VS Code API `^1.85.0` and does not call Cursor-only extension APIs. |
| Live Cursor hook fire | **Not exercised.** No `beforeSubmitPrompt`, file edit, agent response, or stop payload was captured from a running agent. |
| Extension Development Host | **Not launched.** Opening it would start a GUI window, and this session did not attach to one. Launch config: `.vscode/launch.json`. |
| Windows / Linux hook paths | **Not executed.** |

## Where hooks load

All matching hooks from every source run. Responses merge: any `deny` wins over `ask`, and `ask` wins over `allow`. `user_message` and `agent_message` are concatenated. For other fields, including `followup_message`, the last response wins.

Priority (highest to lowest): Enterprise, Team, Project, User. Plugin hooks run after those.

| Source | Path on this OS | CraftLens |
| --- | --- | --- |
| Enterprise | `/Library/Application Support/Cursor/hooks.json` | Never written. |
| Team | Dashboard sync into `~/.cursor/managed/team_*/hooks/` | Never written. |
| Project | `<repo>/.cursor/hooks.json` | Never written. Cloud agents load this file and do not load the user file. |
| User | `~/.cursor/hooks.json` | Opt-in managed command entries only, after a backup of the existing bytes. |

User hooks run with cwd `~/.cursor/`. Commands are shell strings, so CraftLens quotes the Node and script paths.

Cloud agents skip hooks during early read-only turns. `sessionEnd` is an IDE session boundary and does not map to a cloud chat. The panel must describe live capture as local IDE only.

`hooks.json` is reloaded on save. Invalid JSON from a hook, or a response that fails schema checks, can block `beforeSubmitPrompt`. Crashes and timeouts fail open for several command hooks unless `failClosed` is set. CraftLens still prints `{"continue":true}` and exit code 0, and it does not set `failClosed`.

## Events CraftLens subscribes to

Common input fields documented for agent hooks: `conversation_id`, `generation_id`, `model`, `model_id`, `model_params`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`.

CraftLens keeps `conversation_id`, `generation_id`, `hook_event_name`, `cursor_version`, and `workspace_roots` (hashed into a workspace id). It drops `user_email`, `transcript_path`, `model`, `model_id`, and `model_params`.

`session_id` is documented on `sessionStart` and `sessionEnd` and is the same value as `conversation_id`. Other events in the public examples do not include `session_id`. Missing ids are not merged into another task.

| Hook | Documented input CraftLens reads | Stdout CraftLens returns | Live status |
| --- | --- | --- | --- |
| `sessionStart` | `session_id`, `is_background_agent`, `composer_mode` | `{}` (no `additional_context`, no env injection) | Unverified |
| `beforeSubmitPrompt` | `prompt`, attachment count only | `{"continue":true}` always. Never `continue:false`. | Unverified |
| `postToolUse` | `tool_name`, `tool_use_id`, `duration`, command summary, exit code if present in JSON output | `{}` | Unverified |
| `postToolUseFailure` | `tool_name`, `tool_use_id`, short failure summary | `{}` | Unverified |
| `afterFileEdit` | `file_path` made workspace-relative, edit count. Edit text is not stored. | `{}` | Unverified |
| `afterAgentResponse` | short summary of `text` | `{}` | Unverified |
| `stop` | `status`, `loop_count` | `{}`. Never `followup_message`. | Unverified |
| `sessionEnd` | `session_id`, `reason`, `duration_ms` | `{}` | Unverified |

## Explicit non-goals

- `afterAgentThought` is documented and **ignored**. CraftLens does not read thinking text.
- Tab hooks (`beforeTabFileRead`, `afterTabFileEdit`) are not subscribed.
- `beforeReadFile` content, full `tool_output`, and shell `output` are not stored.
- CraftLens does not return `followup_message`, `updated_input`, or `permission` decisions.
- Project hook install is not implemented, so a cloud agent working on a repo does not gain CraftLens hooks by default.

## VS Code-compatible host

The panel, commands, diagnostics, and secret storage use the VS Code extension API. Without Cursor hooks the extension stays in manual / synthetic mode and must not claim to be live. That fallback is implemented and covered by tests. It was not installed into a stock VS Code application in this session.

## Spike

`packages/hook-bridge` parses stdin JSON, writes one allowlisted event, and always prints fail-open stdout. Tests feed the synthetic payloads in `packages/test-fixtures/src/cursor-payloads.ts`. Those payloads are shaped from the documentation above. They are not recordings.
