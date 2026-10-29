# Contributing

The license is not chosen. Do not assume you can redistribute this code.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Add a failure-path test with new behavior. Do not claim a hook event was observed unless a live payload was saved. Do not put secrets, absolute home paths, or private repos in fixtures.

## Boundaries

UI code stays in `packages/panel-ui`. Do not import `vscode` from `packages/core`, `packages/analysis`, or `packages/providers`.
