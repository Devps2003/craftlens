# Architecture

CraftLens is a local VS Code-compatible extension.

- `apps/extension` talks to VS Code, secret storage, the git CLI, and the inbox file. It does not put secrets in webview messages.
- `packages/panel-ui` renders a view model. It cannot read the filesystem.
- `packages/contracts` is the versioned Zod boundary for events, tasks, and panel messages.
- `packages/core` applies events to tasks and builds the panel view.
- `packages/storage` writes versioned JSON and JSONL under a hashed workspace id.
- `packages/hook-bridge` maps Cursor hook stdin to that event schema and merges user hooks without replacing the file blindly.
- `packages/context` reads git status and diff through an injected runner. The extension uses `git` via `execFile`, not a shell string.
- `packages/analysis`, `packages/knowledge`, and `packages/providers` produce the brief. The offline engine always runs. A provider runs only after a key and a non-local privacy mode.

See `docs/decisions/` for transport, storage, provider, license, and UI placement.
