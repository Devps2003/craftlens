# Support

CraftLens has no hosted account and no telemetry. If something fails, the coding agent should still be able to continue.

- Live events disconnected: run **CraftLens: Install hooks**, or use **CraftLens: Load synthetic task**. Cloud agents do not load `~/.cursor/hooks.json`.
- Hooks did not install: the existing `hooks.json` was not valid JSON, so CraftLens left it alone.
- Provider errors stay in the panel and fall back to the offline brief.

There is no support contract with this unreleased tree. File issues against the repository once it has an owner and a license.
