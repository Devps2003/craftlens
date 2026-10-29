# ADR 0006 — Panel placement

## Status

Accepted for V1.

## Decision

The default surface is an activity-bar webview. The user can drag that view with the host's own controls. CraftLens does not inject into Electron and does not create an always-on-top window.

Secondary-sidebar contribution points differ across VS Code versions. Activity bar is the portable default for `engines.vscode` `^1.85.0`.

## Consequences

The product plan's "secondary sidebar when supported" is a host move, not a separate view. Translucent overlay work stays out of V1.
