import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@craftlens/contracts";
import { resolveSettings } from "./settings";

describe("settings privacy boundary", () => {
  it("keeps the user privacy mode when workspace settings try to widen it", () => {
    const resolved = resolveSettings(
      { ...DEFAULT_SETTINGS, privacyMode: "local-only", persistence: "local", profileId: "learn" },
      { privacyMode: "workspace-context", persistence: "off", profileId: "architect" },
    );
    expect(resolved.privacyMode).toBe("local-only");
    expect(resolved.persistence).toBe("local");
    expect(resolved.profileId).toBe("architect");
  });
});
