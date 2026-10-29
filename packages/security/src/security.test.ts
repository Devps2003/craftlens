import { describe, expect, it } from "vitest";
import {
  hashRoots,
  isProtectedPath,
  redactSecrets,
  relativeToRoots,
  resolveInsideWorkspace,
} from "./index";

describe("redaction and paths", () => {
  it("redacts secret-like prompt text", () => {
    const result = redactSecrets("please use sk-testsecret1234567890 and password=hunter2");
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("sk-testsecret");
    expect(result.text).not.toContain("hunter2");
  });

  it("rejects protected files, traversal, and paths outside the workspace", () => {
    expect(isProtectedPath("config/.env.local")).toBe(true);
    expect(isProtectedPath("src/app.ts")).toBe(false);
    expect(relativeToRoots(["/work/app"], "/work/app/src/app.ts")).toBe("src/app.ts");
    expect(relativeToRoots(["/work/app"], "/etc/passwd")).toBeNull();
    expect(resolveInsideWorkspace(["/work/app"], "../secrets")).toBeNull();
    expect(resolveInsideWorkspace(["/work/app"], "src/app.ts")).toBe("/work/app/src/app.ts");
  });

  it("hashes roots and does not use the absolute path as the id", () => {
    const id = hashRoots(["/Users/someone/project"]);
    expect(id).toHaveLength(24);
    expect(id).not.toContain("Users");
    expect(hashRoots(["/Users/someone/project"])).toBe(id);
  });
});
