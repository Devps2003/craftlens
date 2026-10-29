import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

const alias = {
  "@craftlens/contracts": resolve(root, "packages/contracts/src/index.ts"),
  "@craftlens/core": resolve(root, "packages/core/src/index.ts"),
  "@craftlens/storage": resolve(root, "packages/storage/src/index.ts"),
  "@craftlens/security": resolve(root, "packages/security/src/index.ts"),
  "@craftlens/context": resolve(root, "packages/context/src/index.ts"),
  "@craftlens/hook-bridge": resolve(root, "packages/hook-bridge/src/index.ts"),
  "@craftlens/analysis": resolve(root, "packages/analysis/src/index.ts"),
  "@craftlens/providers": resolve(root, "packages/providers/src/index.ts"),
  "@craftlens/knowledge": resolve(root, "packages/knowledge/src/index.ts"),
};

await build({
  entryPoints: [resolve(here, "extension.ts")],
  bundle: true,
  outfile: resolve(here, "../dist/extension.js"),
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  sourcemap: false,
  target: "node18",
  alias,
  logLevel: "info",
});

await build({
  entryPoints: [resolve(root, "packages/hook-bridge/src/cli.ts")],
  bundle: true,
  outfile: resolve(here, "../dist/hook-cli.js"),
  platform: "node",
  format: "cjs",
  sourcemap: false,
  target: "node18",
  alias,
  logLevel: "info",
});
