# ADR 0002 — Local storage

## Status

Accepted for V1.

## Decision

Task records are versioned JSON files. The inbox and the applied event log are append-only JSONL. Both sit behind a storage interface. Writes use a temp file plus rename for task documents, and a short-lived lock directory so two writers do not tear a task file.

SQLite and native addons are deferred. A corrupt line or task file is quarantined and skipped so startup continues.

Retention is a per-user day count. Deleting data removes that workspace's tasks, feedback, and inbox. Export is an explicit action.

## Consequences

A later SQLite store can implement the same interface. V1 has a migration function so a future schema version can be read without crashing; unknown versions are quarantined.
