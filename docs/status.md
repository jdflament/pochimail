# Project status

Last updated: 2026-11-19

## Done

- **M0 Foundation**: complete (#10–#21, #25, #28 and related chores).
- **M1 Core & events**: complete (#22, #24, #26, #27, #30–#34, #39, #41–#43, #45, #48).
- **Docs/chores**: D11 recorded (#44); repo and CI maintenance (#23, #29, #35–#38, #40, #52); Electron install documented and verified on a cold install (#59).
- **Merged M2/M4 tickets**: M2-01 (#49), M2-02 (#46), M2-03 (#51), M2-04 (#53), M2-06 (#60), M4-01 (#54), M4-03 (#47), M4-04 (#50), M4-07 (#56), M4-08 (#64).
- **M4-09 Responsive layout** (sidebar, icon rail, bottom tabs, account switcher, hidden empty categories): done with #70. Known gaps (decided): the Overview is not scoped to the account switcher yet (deferred to M4-14, the Overview ticket; only the sidebar counts follow the switcher), and the Topics group is not shown because no topic data exists yet.
- **M4-06 Mascot behaviours**: done with #57 (merge pending).
- **M4-10 Welcome screen and onboarding stepper**: done (PR number added on open); shared onboarding layout keeps Pochi and the step indicator in place across Welcome, Connect and Set up.
- **M2-05 OAuth PKCE loopback sign-in**: done with #66 (merge pending; wired into the Connect screen by M4-12).
- **i18n: French + Japanese**: done with #62 (typed fr/ja catalogs, locale resolution, locale plural/number/date rules).
- **Refactor**: UI component rule cleanup (ui-audit-20261119 items 1–4,8): undo toast replaced by sonner toast + action with `once` helper, status-strip/dialog composition, review labels required, storage-bar/i18n copy cleanup (#61).

## In progress

- **M4-02** worker composition root and model host: in review (PR pending merge).

## Next

Ordered by priority (UI first):

1. **M4 UI**: M4-14.
2. **M2 lane**: M2-05 onward (see [`docs/tickets/m2-m4-lanes.md`](tickets/m2-m4-lanes.md)).

## Open decisions

- **Demo mode in packaged builds (M4-02)**: demo mode (`POCHIMAIL_DEMO=small|full`, fixture mailbox) is dev/E2E only; a packaged app ignores it. How `@pochimail/testing` ships in a packaged build is for the maintainer to decide.
- None blocking. Resolved planning questions are recorded in [`docs/tickets/m2-m4-lanes.md`](tickets/m2-m4-lanes.md).

## Known follow-ups

- **M3**: needs-reply detector has no age window; current precision 0.26. The Overview's `toReview` over the small fixture is 56, not 7 + 3 + 12 = 22: needs-reply 45 (7 expected: the scan stores no threads, so every inbound people email counts as last in its thread, and there is no age window), time-sensitive 11 (3: the deadline word list also matches ordinary mail), important-sender 0 (12: nothing in the scan records VIP or reply counts per sender). Needs real detector work (M3).
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
