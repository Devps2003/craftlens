# CraftLens

CraftLens sits beside an AI coding agent and keeps an evidence-backed engineering brief for the task you just asked for: what the prompt appears to require, which risks are worth a look, what was actually observed, and one next check.

It does not edit code, run your tests, or call a model unless you configure one.

## Status

Local V1 implementation. The license is undecided (`UNLICENSED` in package metadata means no rights are granted). It has not been published.

Live Cursor hook payloads were **not** captured on this machine. The capability matrix is in [docs/capabilities/cursor-hooks.md](docs/capabilities/cursor-hooks.md). Windows and Linux hook paths were not executed.

## Use it

CraftLens is free. It has no account and no paid plan.

1. Install the extension and open the CraftLens view. Hooks install themselves.
2. Install the [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) desktop app and add one free provider key there (Groq, Google, or another free tier).

CraftLens reads FreeLLMAPI's local key from this computer and sends only a short prompt summary to `127.0.0.1`. If FreeLLMAPI is not running, the panel stays on the free offline checklist.

Developers of this repo can run `npm test` and launch **Run CraftLens** from `.vscode/launch.json`.

## Hooks

**CraftLens: Install hooks** merges command entries into `~/.cursor/hooks.json` after saving the previous file. It refuses to overwrite invalid JSON. **CraftLens: Uninstall hooks** restores that backup. Project `.cursor/hooks.json` is not modified. Cloud agents do not load the user hook file, so the panel says live events are local-IDE only.

Hooks print `{"continue":true}` and do not return a follow-up message. A CraftLens failure must not block the agent.

## Provider and privacy

The default is local-only offline analysis. An API key is stored with VS Code secret storage through **CraftLens: Set provider API key**. The webview never receives it. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Publish

Not done. See [docs/PUBLISHING.md](docs/PUBLISHING.md).
