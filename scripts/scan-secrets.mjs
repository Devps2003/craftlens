import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const skip = new Set(["node_modules", "dist", "media", ".git"]);
const patterns = [/sk-live-/, /sk-proj-/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const hits = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skip.has(entry.name) || entry.name === "scan-secrets.mjs") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|json|md|yml|yaml)$/.test(entry.name)) continue;
    const text = await readFile(full, "utf8");
    if (patterns.some((pattern) => pattern.test(text))) hits.push(full);
  }
}

await walk(process.cwd());
if (hits.length > 0) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("secret scan: no live-looking keys");
