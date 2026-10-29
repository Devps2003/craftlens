# CraftLens

An evidence-backed engineering companion for AI-assisted coding.

CraftLens keeps a task brief beside the editor: the prompt in short, likely decisions, a few risks with a way to check them, and what was actually observed. It does not change your code or call a model until you opt in.

## Use

1. Install the extension and open the CraftLens view. Hooks install on their own.
2. Install FreeLLMAPI and add one free provider key in that app. CraftLens finds it on this computer.

No CraftLens account, API key, or setup form. Without FreeLLMAPI, the panel still shows a free offline checklist.

Live hook support is for the local IDE. Cloud agents do not load user hooks.

## Privacy

Task history stays on disk under the extension's global storage. Prompts are redacted for secret-like strings. Provider keys stay in the editor's secret storage. Details: the repository `docs/PRIVACY.md`.

## Limits

- Offline analysis is a checklist grounded in the prompt and changed file names. It is not a claim that the change is correct.
- A test is "Passed" only when a tool result included an exit code. Otherwise the panel says "Not observed".
- The license is not chosen yet. This package is not a public release.
