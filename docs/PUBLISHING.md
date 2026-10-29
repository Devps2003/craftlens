# Publishing

Do not publish this tree yet.

Blockers:

- License is undecided. There is no LICENSE file.
- Publisher id `craftlens` was not checked against Open VSX.
- The name CraftLens was not trademark-checked.
- Live hooks were not exercised. Windows and Linux were not executed.
- No Open VSX token is configured, and none should be committed.

## Local package

```bash
npm run package
node scripts/inspect-vsix.mjs
```

This writes `craftlens.vsix` at the repo root. Install it locally with:

```bash
cursor --install-extension craftlens.vsix
```

or the VS Code equivalent `code --install-extension craftlens.vsix`.

## Open VSX, when the owner says so

These commands were **not** run:

```bash
npx @vscode/vsce publish --packagePath craftlens.vsix
npx ovsx publish craftlens.vsix -p "$OVSX_PAT"
```

`OVSX_PAT` belongs in the CI secret store, not in the repo. Publish only after the license, publisher namespace, and a real host pass are recorded.

## Dependency audit (2026-10-29)

`npm audit --omit=dev` is the runtime check. A full `npm audit` still reports a high advisory in `@azure/msal-node`, pulled in by `@vscode/vsce` through `@azure/identity`. `npm audit fix` does not move it. That package is not in the VSIX. The packaged files are `dist/extension.js`, `dist/hook-cli.js`, `media/panel.js`, `media/panel.css`, `media/icon.svg`, `package.json`, and `readme.md`.

Cursor's third-party extension registry is Open VSX. Marketplace review is not guaranteed.
