# Privacy

CraftLens is local-first.

## What stays on the machine

- Task JSON and feedback under VS Code global storage, keyed by a hash of the workspace roots. The hash is not the absolute path.
- Hook inbox files in `~/.craftlens/inbox/`. Each line is an allowlisted event. Prompt text is passed through a redactor. Edit contents, tool output bodies, email, and transcript paths are not stored.
- The provider API key in VS Code secret storage.

## What can leave the machine

CraftLens has no server and no paid plan. It sends a short prompt summary to FreeLLMAPI at `127.0.0.1`. FreeLLMAPI then sends that summary to a free model provider you connected inside FreeLLMAPI (for example Groq or Google). File contents and diffs are not included in the default prompt-summary mode.

| Mode | Sent |
| --- | --- |
| local-only | Nothing |
| prompt-summary | Redacted prompt summary and task category |
| diff-snippets | Prompt summary and changed file names |
| workspace-context | Prompt summary and changed file names |

CraftLens does not upload the repo, full diffs, or command output in V1. Redaction is pattern-based and not perfect. There is no telemetry.

## Retention and deletion

Default retention is 30 days. **CraftLens: Clear local data** deletes the current workspace store. Export writes a JSON file only after you pick a path.

If persistence is off, the hook inbox stores an empty prompt because `~/.craftlens/capture.json` says `storePrompt: false`.

## Hook install

On first launch, CraftLens copies the previous `~/.cursor/hooks.json` to `~/.craftlens/hooks-backup.json` once, then adds its commands. Uninstall writes the backup back. Invalid JSON is left untouched.
