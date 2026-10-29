import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const UNIFIED_KEY = /freellmapi-[a-f0-9]{48}/;

export interface FreeLlmEndpoint {
  baseUrl: string;
  apiKey: string;
  model: "auto";
}

export function readUnifiedKey(bytes: Buffer): string | null {
  const text = bytes.subarray(0, Math.min(bytes.length, 2_000_000)).toString("latin1");
  return text.match(UNIFIED_KEY)?.[0] ?? null;
}

export function freeLlmDataDirs(home: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") return [path.join(home, "AppData", "Roaming", "FreeLLMAPI")];
  if (platform === "linux") return [path.join(home, ".config", "FreeLLMAPI")];
  return [path.join(home, "Library", "Application Support", "FreeLLMAPI")];
}

export async function discoverFreeLlmApi(input?: {
  home?: string;
  platform?: NodeJS.Platform;
  readFile?: (file: string) => Promise<Buffer>;
}): Promise<FreeLlmEndpoint | null> {
  const home = input?.home ?? os.homedir();
  const platform = input?.platform ?? process.platform;
  const read = input?.readFile ?? ((file: string) => readFile(file));
  for (const dir of freeLlmDataDirs(home, platform)) {
    let database: Buffer;
    try {
      database = await read(path.join(dir, "freeapi.db"));
    } catch {
      continue;
    }
    const apiKey = readUnifiedKey(database);
    if (!apiKey) continue;
    const port = await readPort(path.join(dir, "config.json"), read);
    return { baseUrl: `http://127.0.0.1:${port}/v1`, apiKey, model: "auto" };
  }
  return null;
}

async function readPort(file: string, read: (file: string) => Promise<Buffer>): Promise<number> {
  try {
    const parsed = JSON.parse((await read(file)).toString("utf8")) as { port?: unknown };
    if (typeof parsed.port === "number" && parsed.port > 0 && parsed.port < 65536) return parsed.port;
  } catch {
    // Desktop uses 31415. The Docker install uses 3001 and has no config file here.
  }
  return 31415;
}
