# ADR 0001 — Event transport

## Status

Accepted for V1.

## Decision

Cursor hooks append one JSON line to `~/.craftlens/inbox/<workspaceId>.jsonl`. The extension tails that file. Hook scripts do not call the network, Git, or a model.

`beforeSubmitPrompt` always returns `{"continue":true}`. `stop` returns `{}` and never `followup_message`. Parse and write failures still exit 0 with `{"continue":true}`.

## Consequences

Live capture requires an explicit install into `~/.cursor/hooks.json`. Project `.cursor/hooks.json` is left untouched. Cloud agents, which do not load the user hook file, stay disconnected until a later project-hook design.

Workspace identity is a hash of normalized roots. Absolute paths are not the id.
