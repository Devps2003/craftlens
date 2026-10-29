import { describe, expect, it } from "vitest";
import { discoverFreeLlmApi, freeLlmDataDirs, readUnifiedKey } from "./freellmapi";

describe("FreeLLMAPI discovery", () => {
  it("reads the unified key from the local database bytes", () => {
    const key = `freellmapi-${"ab".repeat(24)}`;
    const bytes = Buffer.from(`noise\0settings${key}tail`);
    expect(readUnifiedKey(bytes)).toBe(key);
    expect(readUnifiedKey(Buffer.from("no key here"))).toBeNull();
  });

  it("uses the desktop data directory and does not require a typed key", async () => {
    const key = `freellmapi-${"cd".repeat(24)}`;
    const home = "/Users/someone";
    expect(freeLlmDataDirs(home, "darwin")[0]).toContain("Application Support/FreeLLMAPI");
    expect(freeLlmDataDirs(home, "win32")[0]).toContain("AppData");
    const found = await discoverFreeLlmApi({
      home,
      platform: "darwin",
      readFile: async (file: string) => {
        if (file.endsWith("config.json")) return Buffer.from(JSON.stringify({ port: 31415 }));
        if (file.endsWith("freeapi.db")) return Buffer.from(key);
        throw new Error("missing");
      },
    });
    expect(found).toEqual({ baseUrl: "http://127.0.0.1:31415/v1", apiKey: key, model: "auto" });
  });

  it("returns null when FreeLLMAPI is not installed", async () => {
    const found = await discoverFreeLlmApi({
      home: "/tmp/none",
      platform: "linux",
      readFile: async () => {
        throw new Error("missing");
      },
    });
    expect(found).toBeNull();
  });
});
