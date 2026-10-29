import { createHash } from "node:crypto";
import path from "node:path";

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{10,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi,
  /\b(api[_-]?key|secret|password|token)\s*[:=]\s*\S+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const PROTECTED_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
  "id_rsa",
  "id_dsa",
]);

export function redactSecrets(input: string): { text: string; redacted: boolean } {
  let text = input;
  let redacted = false;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, () => {
      redacted = true;
      return "[redacted]";
    });
  }
  return { text, redacted };
}

export function isProtectedPath(relativePath: string): boolean {
  const base = path.posix.basename(relativePath.replace(/\\/g, "/")).toLowerCase();
  if (PROTECTED_NAMES.has(base)) return true;
  if (base.startsWith(".env")) return true;
  if (base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".p12")) return true;
  return false;
}

export function workspaceIdFromRoots(roots: string[]): string {
  return hashRoots(roots);
}

export function hashRoots(roots: string[]): string {
  const normalized = roots.map(normalizeRoot).sort();
  return createHash("sha256").update(normalized.join("\0")).digest("hex").slice(0, 24);
}

export function normalizeRoot(root: string): string {
  let value = root.replace(/\\/g, "/");
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

export function relativeToRoots(roots: string[], absolutePath: string): string | null {
  const target = normalizeRoot(absolutePath);
  const sorted = [...roots].map(normalizeRoot).sort((a, b) => b.length - a.length);
  for (const root of sorted) {
    if (target === root) return null;
    if (target.startsWith(`${root}/`)) {
      const relative = target.slice(root.length + 1);
      if (relative.split("/").includes("..")) return null;
      return relative;
    }
  }
  return null;
}

export function resolveInsideWorkspace(roots: string[], relativePath: string): string | null {
  if (!relativePath || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return null;
  if (relativePath.split(/[/\\]/).includes("..")) return null;
  const normalized = relativePath.replace(/\\/g, "/");
  const root = roots[0];
  if (!root) return null;
  const full = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  return full;
}

export function scrubSecretsFromUnknown(value: unknown, secret: string): unknown {
  if (!secret) return value;
  const json = JSON.stringify(value).split(secret).join("[redacted]");
  return JSON.parse(json) as unknown;
}
