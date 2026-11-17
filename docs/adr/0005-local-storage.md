# 0005 — Local storage and encryption at rest

Status: Proposed · Brief: §5.3 › Storage performance, §5.10 › Data at rest · Research: M0-12

## Decision
- **SQLite with SQLCipher-compatible encryption** via `better-sqlite3-multiple-ciphers` (synchronous, fast, rebuilt per OS/arch by electron-builder). WAL mode, `foreign_keys=ON`, tuned `cache_size`/`mmap_size`, one writer (the worker).
- **Key management**: a random 256-bit key generated at first launch, stored encrypted with Electron `safeStorage` (Keychain / DPAPI / libsecret). On Linux without a secret service (`basic_text` backend) we warn in plain language and ask before continuing.
- **Schema & migrations**: Drizzle ORM (schema in TS, SQL migrations checked in, Midday parity) — **heavyweight dependency: needs your approval**; fallback is hand-written SQL + a tiny migrator.
- **Indexes** for every list/filter query; **FTS5** over sender names and subjects (local only); **sender stats maintained incrementally** in the same transaction as message upserts.
- **Blob store**: content-addressed (`sha256/ab/cd/…`), files encrypted with AES-256-GCM using a key derived from the DB key; plaintext only when the user exports documents to their chosen folder.
- **Data locations**: app data dir per OS via the `Platform` port; "Show in Finder" and "Delete all local data" operate on it. Removing an account deletes its rows and blobs not referenced by another account.
- **Backups**: none in v1 (data is a cache of the mailbox + action log); "Export my data" writes settings, labels and history as JSON.

## Alternatives
`node:sqlite` (no encryption) · libsql (encryption, but less proven in Electron) · IndexedDB in renderer (wrong process, no encryption).

## To verify
`better-sqlite3-multiple-ciphers` builds for Electron on macOS universal, Windows x64/arm64, Linux x64/arm64; FTS5 enabled in the build; performance with 100k+ rows.
