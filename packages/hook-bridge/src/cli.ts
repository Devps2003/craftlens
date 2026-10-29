import { appendFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { failOpenStdout, mapCursorPayload } from "./map";

export async function handleHookInput(input: string, logDir = defaultLogDir()): Promise<string> {
  try {
    const parsed = JSON.parse(input) as unknown;
    const mapped = mapCursorPayload(parsed, new Date().toISOString(), { storePrompt: await promptCaptureEnabled(logDir) });
    if (mapped.ok) {
      await mkdir(logDir, { recursive: true });
      const file = path.join(logDir, `${mapped.event.workspaceId}.jsonl`);
      await appendFile(file, `${JSON.stringify(mapped.event)}\n`, "utf8");
    }
  } catch {
    // Fail open. The coding agent must not wait on CraftLens.
  }
  return failOpenStdout();
}

export function defaultLogDir(): string {
  return path.join(os.homedir(), ".craftlens", "inbox");
}

async function promptCaptureEnabled(logDir: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(logDir, "..", "capture.json"), "utf8");
    const parsed = JSON.parse(raw) as { storePrompt?: boolean };
    return parsed.storePrompt !== false;
  } catch {
    return true;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("hook-cli.js");
if (invokedDirectly) {
  readStdin()
    .then((input) => handleHookInput(input))
    .then((output) => {
      process.stdout.write(output);
    })
    .catch(() => {
      process.stdout.write(failOpenStdout());
    });
}
