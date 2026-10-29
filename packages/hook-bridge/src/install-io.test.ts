import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { installManagedHooks, uninstallManagedHooks } from "./install-io";

describe("managed hook install", () => {
  it("preserves existing hooks and restores the original bytes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "craftlens-hooks-"));
    const hooksFile = path.join(dir, "hooks.json");
    const backupFile = path.join(dir, "backup.json");
    const original = '{\n  "version": 1,\n  "hooks": { "stop": [{ "command": "echo keep" }] }\n}\n';
    await mkdir(dir, { recursive: true });
    await writeFile(hooksFile, original, "utf8");
    const command = "node '/opt/craftlens/hook-cli.js'";
    expect(await installManagedHooks({ hooksFile, backupFile, command })).toEqual({ ok: true });
    const merged = await readFile(hooksFile, "utf8");
    expect(merged).toContain("echo keep");
    expect(merged).toContain(command);
    await writeFile(hooksFile, `${merged}\n`, "utf8");
    expect(await installManagedHooks({ hooksFile, backupFile, command })).toEqual({ ok: true });
    expect(await readFile(backupFile, "utf8")).toBe(original);
    expect(await uninstallManagedHooks({ hooksFile, backupFile, command })).toEqual({ ok: true });
    expect(await readFile(hooksFile, "utf8")).toBe(original);
  });

  it("refuses to overwrite invalid JSON", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "craftlens-hooks-"));
    const hooksFile = path.join(dir, "hooks.json");
    await writeFile(hooksFile, "{", "utf8");
    const result = await installManagedHooks({
      hooksFile,
      backupFile: path.join(dir, "backup.json"),
      command: "node craftlens",
    });
    expect(result.ok).toBe(false);
    expect(await readFile(hooksFile, "utf8")).toBe("{");
  });
});
