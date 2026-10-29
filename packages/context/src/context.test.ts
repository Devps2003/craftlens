import { describe, expect, it } from "vitest";
import { attributeFiles, binaryPathsFromDiff, captureBaseline, parsePorcelain, summarizeDiagnostics } from "./index";
import type { GitRunner } from "./index";

describe("git evidence", () => {
  it("labels pre-existing dirty files and does not invent a test result", () => {
    const porcelain = parsePorcelain(" M README.md\nR  old.ts -> new.ts\n");
    expect(porcelain.map((entry) => entry.path)).toEqual(["README.md", "new.ts"]);
    const files = attributeFiles({
      baselinePaths: ["README.md"],
      hookPaths: ["src/fix.ts"],
      porcelain,
      gitState: "available",
      binaryPaths: binaryPathsFromDiff("Binary files a/assets/logo.png and b/assets/logo.png differ\n"),
    });
    expect(files.find((file) => file.relativePath === "README.md")?.attribution).toBe("pre-existing");
    expect(files.find((file) => file.relativePath === "src/fix.ts")?.attribution).toBe("task");
    expect(files.find((file) => file.relativePath === "new.ts")?.renamed).toBe(true);
    expect(files.find((file) => file.relativePath === "assets/logo.png")?.binary).toBe(true);
    expect(summarizeDiagnostics(null).state).toBe("not-observed");
  });

  it("says when git is missing", async () => {
    const runner: GitRunner = {
      async run() {
        return { ok: false, reason: "no-git", detail: "spawn git ENOENT" };
      },
    };
    const baseline = await captureBaseline(runner, "/tmp/none");
    expect(baseline.state).toBe("no-git");
    expect(baseline.limitation).toMatch(/Git is not available/);
  });

  it("keeps attribution unknown when git cannot be queried", () => {
    const files = attributeFiles({
      baselinePaths: [],
      hookPaths: ["src/a.ts"],
      porcelain: [],
      gitState: "no-git",
    });
    expect(files[0]?.attribution).toBe("unknown");
  });
});
