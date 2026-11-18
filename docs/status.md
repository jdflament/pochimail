# Project status

Last updated: 2026-11-19

## Done

- **M0 Foundation**: complete (#10–#21, #25, #28 and related chores).
- **M1 Core & events**: complete (#22, #24, #26, #27, #30–#34, #39, #41–#43, #45, #48).
- **Docs/chores**: D11 recorded (#44); repo and CI maintenance (#23, #29, #35–#38, #40, #52).
- **Merged M2/M4 tickets**: M2-01 (#49), M2-02 (#46), M2-03 (#51), M2-04 (#53), M4-03 (#47), M4-04 (#50), M4-07 (#56).

## In progress

- **M4-01** IPC contract and streaming subscriptions — PR #54 (`feat/m4-01-ipc-contract`, open).

## Next

Ordered by priority (UI first):

1. **M4 UI**: M4-06, M4-08, M4-02, M4-10, M4-14.
2. **M2 lane**: M2-05 onward (see [`docs/tickets/m2-m4-lanes.md`](tickets/m2-m4-lanes.md)).

## Open decisions

- None blocking. Resolved planning questions are recorded in [`docs/tickets/m2-m4-lanes.md`](tickets/m2-m4-lanes.md).

## Known follow-ups

- **M3**: needs-reply detector has no age window; current precision 0.26.
- **Packaging CI**: macOS packaging job is flaky.

## How to resume

1. Read [`AGENTS.md`](../AGENTS.md), then this file.
2. Pick the ticket in [`docs/tickets/`](tickets/) and read the brief/ADR sections it lists.
3. Create a branch named `<type>/<id>-<slug>` from `main`.
4. Implement the ticket, add tests that guard real failures, and run `pnpm check`.
5. Open a PR, let CI pass, merge via the merge queue, and update this file in the same PR.

## Working rules

- **D11**: store metadata, not mail; never persist message bodies.
- **Sensitive tickets** get a review before merge (storage/keys, auth/OAuth, network/allow-list, IPC/preload, Electron security, logger/redaction).
- **Tests bar**: behaviour tests through public entry points; each test guards a named failure.
- **Never `--admin`** to bypass protections. Use the **merge queue** (`gh pr merge --squash --auto`).
