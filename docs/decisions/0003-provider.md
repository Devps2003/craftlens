# ADR 0003 — Provider

## Status

Accepted for V1.

## Decision

The first remote adapter speaks the OpenAI chat-completions JSON shape (`POST {baseUrl}/chat/completions`). The same adapter is used for api.openai.com and for a base URL the user types (local or enterprise). Compatibility beyond that JSON shape is not promised.

The default model path is [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) on `127.0.0.1` (desktop port 31415, model `auto`). CraftLens reads the unified key from the local `freeapi.db` and does not ask the user to paste it. Only a prompt summary is sent. If FreeLLMAPI is not installed, analysis stays on the deterministic offline engine.

There is no CraftLens subscription and no CraftLens account.

Malformed model output is repaired once, then discarded in favor of the offline result. Provider output cannot mark a claim `verified` unless the evidence kind is a command, diagnostic, or diff that CraftLens already observed.

Cursor subscription models are not called. No Cursor API was verified as available to third-party extensions for this product.

## Consequences

Users pay their own provider. Request count is capped per task and file-edit bursts are debounced. Failures stay inside CraftLens.
