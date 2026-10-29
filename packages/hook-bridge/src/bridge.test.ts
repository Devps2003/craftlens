import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handleHookInput } from "./cli";
import { hookCommand, planInstall, planUninstall } from "./install";
import { mapCursorPayload } from "./map";

const roots = ["/tmp/craftlens-fixture"];

describe("cursor payload mapping", () => {
  it("drops email and thought text, and fail-opens on malformed input", async () => {
    const mapped = mapCursorPayload({
      hook_event_name: "beforeSubmitPrompt",
      conversation_id: "conv-1",
      user_email: "person@example.com",
      transcript_path: "/secret/transcript.jsonl",
      workspace_roots: roots,
      prompt: "ship sk-testsecret1234567890",
      attachments: [],
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const serialized = JSON.stringify(mapped.event);
    expect(serialized).not.toContain("person@example.com");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("sk-testsecret");
    expect(mapCursorPayload({ hook_event_name: "afterAgentThought", text: "hidden", workspace_roots: roots }).ok).toBe(
      false,
    );

    const dir = await mkdtemp(path.join(os.tmpdir(), "craftlens-hook-"));
    const stdout = await handleHookInput("not-json", dir);
    expect(stdout).toBe('{"continue":true}\n');
    expect(stdout).not.toContain("followup_message");
  });

  it("writes an allowlisted file edit and preserves unrelated hooks", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "craftlens-hook-"));
    const stdout = await handleHookInput(
      JSON.stringify({
        hook_event_name: "afterFileEdit",
        conversation_id: "conv-9",
        workspace_roots: roots,
        file_path: "/tmp/craftlens-fixture/src/app.ts",
        edits: [{ old_string: "a", new_string: "b" }],
      }),
      dir,
    );
    expect(stdout).toBe('{"continue":true}\n');
    const lines = await readFile(path.join(dir, `${(await import("@craftlens/security")).hashRoots(roots)}.jsonl`), "utf8");
    expect(lines).toContain("src/app.ts");
    expect(lines).not.toContain("old_string");

    const original = '{\n  "version": 1,\n  "hooks": {\n    "beforeSubmitPrompt": [{ "command": "./hooks/mine.sh" }]\n  }\n}\n';
    const command = hookCommand("/usr/bin/node", "/opt/craftlens/hook-cli.js");
    const installed = planInstall(original, command);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.next).toContain("./hooks/mine.sh");
    expect(installed.next).toContain(command);
    const restored = planUninstall(installed.backup, command, installed.next);
    expect(restored).toEqual({ action: "write", text: original });
    expect(planInstall("{", command).ok).toBe(false);
  });

  it("does not record a test as passed when output has no exit code", () => {
    const mapped = mapCursorPayload({
      hook_event_name: "postToolUse",
      conversation_id: "conv-2",
      workspace_roots: roots,
      tool_name: "Shell",
      tool_input: { command: "npm test" },
      tool_output: "All tests passed",
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.event.kind).toBe("tool.completed");
    if (mapped.event.kind === "tool.completed") expect(mapped.event.payload.exitCode).toBeUndefined();
  });
});
