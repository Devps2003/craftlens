# Threat model

CraftLens reads prompts, file paths, and optional model output. Those are untrusted.

| Threat | Mitigation in this tree |
| --- | --- |
| Hook payload tries to inject fields | Zod allowlist. Unknown hooks dropped. `afterAgentThought` ignored. Stdout is only `{"continue":true}`. |
| Prompt or file text contains a fake instruction | Analysis treats it as data. The offline engine does not execute it. |
| Path escape via open-file | Relative paths only, `..` rejected, result must stay under a workspace root. |
| Secret in a prompt or error string | Regex redaction before storage. Provider errors have the key stripped. Webview schema has no key field. |
| Malicious knowledge pack | Built-in JSON is schema-checked in tests. V1 does not load remote packs. |
| Corrupt task file | Quarantine and continue. |
| Hook install clobber | Invalid JSON is refused. Uninstall restores the first backup bytes. |
| Model marks a guess as verified | Provider `verified` claims without command, diagnostic, or diff evidence are downgraded. Risk confidence `verified` from a model is stored as `needs-confirmation`. |
| Supply chain | Lockfile after install. CI runs `npm audit --audit-level=high`. No native addons. |

Out of scope for V1: a malicious VS Code host, a stolen OS user account, and a compromised provider that ignores the JSON schema.
