# Security

Report vulnerabilities privately to the repository owner once a contact exists. This unreleased tree has no security mailbox yet.

Do not open a public issue that includes a real API key, prompt from a private repo, or a hook payload copied from your machine.

CraftLens should fail open. If a hook script breaks, Cursor should still submit the prompt. See `docs/THREAT_MODEL.md`.
