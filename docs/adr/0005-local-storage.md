# 0005 — Local storage and encryption at rest

Status: Accepted (2026-11-17, maintainer, M0-15; driver, key management and packaging researched in M0-12) · Brief: §5.3 › Storage performance, §5.10 › Data at rest · Research: M0-12

## Decision
- **SQLite with SQLCipher-compatible encryption** via `better-sqlite3-multiple-ciphers` (synchronous, fast). Pinned `13.1.1`: it ships Node-API prebuilds, so nothing is rebuilt for Electron's ABI (see Results). WAL mode, `foreign_keys=ON`, tuned `cache_size`/`mmap_size`, one writer (the worker).
- **Key management**: a random 256-bit key generated at first launch, stored encrypted with Electron `safeStorage` (Keychain / DPAPI / libsecret). Use the async `safeStorage` calls (the sync ones are deprecated in Electron 45). On Linux without a secret service (`basic_text` backend) we show a plain-language warning and offer a **passphrase first**; "store without protection" is only a second, explicit choice (decided 2026-11-17). The key is never written silently in that case (`apps/desktop/src/main/storage-key.ts`).
- **Schema & migrations**: **no Drizzle in v1** (decided 2026-11-17, from the M0-12 recommendation); hand-written SQL migrations (versioned `.sql` files, `PRAGMA user_version`) + a tiny migrator + zod-parsed rows behind the storage port. Drizzle stays a later option, revisited if the schema grows (see Results).
- **Indexes** for every list/filter query; **FTS5** over metadata and derived data: sender, subject, snippet, category, signals; never bodies (local only, [ADR 0009](0009-store-metadata-not-mail.md)); **sender stats maintained incrementally** in the same transaction as message upserts.
- **Blob store** (only for documents the user saved, [ADR 0009](0009-store-metadata-not-mail.md)): content-addressed (`sha256/ab/cd/…`), files encrypted with AES-256-GCM using a key derived from the DB key; plaintext only when the user exports documents to their chosen folder.
- **Data locations**: app data dir per OS via the `Platform` port; "Show in Finder" and "Delete all local data" operate on it. Removing an account deletes its rows and blobs not referenced by another account.
- **Backups**: none in v1 (data is a cache of the mailbox + action log); "Export my data" writes settings, labels and history as JSON.

## Alternatives
`node:sqlite` (no encryption) · libsql (encryption, but less proven in Electron) · IndexedDB in renderer (wrong process, no encryption).

## Results (M0-12, 2026-11-17)
Proof: the packaging smoke (M0-10) now also runs the encrypted database inside the **packaged** app. Main gets the key through `safeStorage`, then a `utilityProcess` (where the real database will live) opens an encrypted WAL database with an FTS5 index over 100,000 synthetic messages, queries it, reopens it with the right key and a wrong key, and checks the file header is not plain SQLite. `smoke.ts` fails on any miss. Code: `apps/desktop/src/worker/storage-proof.ts`, `src/main/storage-key.ts`, `packaging/storage-check.ts`. CI: the existing `package` job on three runners (run 44082384668, draft PR #21, 2026-11-17).

| Runner | Key protection | 100k insert + FTS5 | FTS5 query (1,031 hits) | Indexed top-50 | GROUP BY sender | Reopen |
| --- | --- | --- | --- | --- | --- | --- |
| macOS 26 arm64 (universal app) | Keychain | 1221 ms | 0.6 ms | 0.1 ms | 11.9 ms | 22.7 ms |
| Windows 2025 x64 | DPAPI | 1110 ms | 0.9 ms | 0.1 ms | 5.8 ms | 23.6 ms |
| Ubuntu 26.04 x64 (headless, xvfb) | **basic_text** | 684 ms | 0.7 ms | 0.1 ms | 4.0 ms | 11.5 ms |

All three: SQLite 3.54.1, cipher `sqlcipher` (raw 256-bit key, `x'…'` form, so no KDF cost on open), `journal_mode=wal`, `ENABLE_FTS5` compiled in, wrong key rejected, file not plaintext. Shared CI runners, one run each: read these as order of magnitude (about 10 µs per row inserted, sub-millisecond search), not as benchmarks. Insert is one transaction with prepared statements, including the FTS5 row.

**Packaging findings**
- No Electron rebuild is needed: `better-sqlite3-multiple-ciphers` 13 ships Node-API (stable ABI) prebuilds for darwin/linux/linuxmusl/win32 × x64/arm64 and `electron-builder`'s `@electron/rebuild` step only "prepares" them. The app also loads on Electron 45.3.3.
- The `.node` files must be outside `app.asar`: `asarUnpack` on `prebuilds/*.node`. Other OS prebuilds are dropped per platform (`files` globs with `${arch}`), about 2.5 MB per `.node` kept.
- macOS universal: both darwin prebuilds stay in both slices (the merge needs equal Mach-O file sets) and are listed in `mac.x64ArchFiles`. Windows arm64 and Linux arm64 are not built in CI yet; their prebuilds exist upstream.
- `node_modules` now ships only production dependencies, so the renderer-only packages (React, TanStack Router, zod, `@pochimail/ui`) moved to `devDependencies` (Vite bundles them). `electron-vite` bundles anything not in `dependencies`.
- `@electron/asar>minimatch: 3.1.5` was added to the scoped overrides in `pnpm-workspace.yaml` (asarUnpack makes the universal merge call minimatch 3 as a function). The global glob/minimatch overrides and M0-10's scoped ones stay. `minimumReleaseAge` untouched: 13.2.0 (published 2026-11-16) was rejected by it, hence the pin to 13.1.1.

**Linux `basic_text`**
- Electron picks `gnome_libsecret`, `kwallet`/`kwallet5`/`kwallet6` when it finds a secret service, else `basic_text`, which wraps data with a hard-coded password: obfuscation, not protection. `safeStorage.getSelectedStorageBackend()` tells which (Linux only; `unknown` before `ready`). The headless CI runner reports `basic_text` and `isAsyncEncryptionAvailable()` is still true, so availability alone must not be trusted.
- Behaviour implemented: `keyProtection()` returns `os-keychain` / `basic-text` / `unavailable`; `loadOrCreateDatabaseKey()` writes the key only for `os-keychain`. For `basic-text` the app must show the plain-language warning and ask before continuing, and then a user choice is needed (for example a passphrase, or an explicit "store without protection"). That UI and the choice belong to the onboarding tickets; the smoke uses a throwaway key there.
- Not proven: the secure Linux path (libsecret under a real session). Add a CI step with `gnome-keyring` and a D-Bus session if we want it automated.

**Drizzle or not: decided, no for v1**
- Works: `drizzle-orm@0.45.4` runs against the encrypted database and FTS5 (tested in a scratch project, 2026-11-17).
- Costs: its `better-sqlite3` driver imports the package name `better-sqlite3`, so it needs an alias (`better-sqlite3: npm:better-sqlite3-multiple-ciphers@13.1.1`), which ties two drivers' names together and confuses scanners; 16 MB unpacked, large peer matrix; and the parts that matter here (FTS5 virtual table, sync triggers, incremental sender stats, key pragmas) are raw SQL anyway. `drizzle-kit` (0.31.11) adds a second heavyweight tool for migrations.
- Fits better: the hexagonal core (ADR 0003) already hides storage behind ports, so row types are defined once with zod at the adapter. A small migrator (versioned `.sql` files, `PRAGMA user_version`) is under 100 lines. Revisit if the schema grows past what hand-written queries keep readable; the proof shows adoption is possible later without changing the driver.

## Sources (accessed 2026-11-17)
- npm registry, `better-sqlite3-multiple-ciphers` (13.1.1 published 2026-11-13, 13.2.0 on 2026-11-16; Node-API via `node-addon-api`, prebuilds in the package) and `drizzle-orm@0.45.4`, `drizzle-kit@0.31.11`.
- Electron 45 `safeStorage` API (typings in `electron@45.3.3`): async functions, `getSelectedStorageBackend()`, deprecation of the sync functions. https://www.electronjs.org/docs/latest/api/safe-storage
- `better-sqlite3-multiple-ciphers` README: https://github.com/m4heshd/better-sqlite3-multiple-ciphers
- SQLite3 Multiple Ciphers (cipher `sqlcipher`, raw key syntax): https://utelle.github.io/SQLite3MultipleCiphers/
- CI evidence: GitHub Actions run 44082384668, job summaries "Encrypted SQLite".

## Still to verify
Windows arm64 and Linux arm64 packaging (prebuilds exist; no CI runners yet); the Linux libsecret path under a real desktop session; performance on real-shaped data (long subjects, 100k+ with sender stats triggers) in the storage tickets.
