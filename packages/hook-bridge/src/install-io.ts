import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { planInstall, planUninstall, type Backup } from "./install";

export async function installManagedHooks(input: {
  hooksFile: string;
  backupFile: string;
  command: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const current = await readMaybe(input.hooksFile);
  const planned = planInstall(current, input.command);
  if (!planned.ok) return planned;
  await mkdir(path.dirname(input.backupFile), { recursive: true });
  await mkdir(path.dirname(input.hooksFile), { recursive: true });
  if (!(await exists(input.backupFile))) {
    const body = planned.backup.kind === "missing" ? "MISSING\n" : planned.backup.text;
    await writeFile(input.backupFile, body, "utf8");
  }
  await writeFile(input.hooksFile, planned.next, "utf8");
  return { ok: true };
}

export async function uninstallManagedHooks(input: {
  hooksFile: string;
  backupFile: string;
  command: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const backup = await readBackup(input.backupFile);
  const current = await readMaybe(input.hooksFile);
  const planned = planUninstall(backup, input.command, current);
  if (planned.action === "refuse") return { ok: false, reason: planned.reason };
  if (planned.action === "delete") await rm(input.hooksFile, { force: true });
  if (planned.action === "write") await writeFile(input.hooksFile, planned.text, "utf8");
  await rm(input.backupFile, { force: true });
  return { ok: true };
}

async function readMaybe(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readBackup(file: string): Promise<Backup | null> {
  const text = await readMaybe(file);
  if (text === null) return null;
  if (text === "MISSING\n") return { kind: "missing" };
  return { kind: "bytes", text };
}
