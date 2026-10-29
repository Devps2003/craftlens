# ADR 0007 — Module boundaries

## Status

Accepted.

## Deviation from the initial skeleton

Packages were added when the milestone needed them, not as empty folders on day one. The boundaries match the product plan:

- `apps/extension` owns the VS Code host.
- `packages/panel-ui` is presentation.
- `packages/contracts` owns schemas.
- `packages/core` owns the task machine and panel view model.
- `packages/storage` owns JSONL and task files.
- `packages/security` owns redaction and path checks.
- `packages/context` owns Git and diagnostic evidence.
- `packages/hook-bridge` and the Cursor mapping inside it are the IDE hook adapter. A second editor would replace that mapping, not the core.
- `packages/analysis`, `packages/providers`, and `packages/knowledge` stay free of `vscode` imports.

No remote backend was added.
