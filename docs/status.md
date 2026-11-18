# Project status

Last updated: 2026-11-19

## Done

- **M0 Foundation**: complete (#10–#21, #25, #28 and related chores).
- **M1 Core & events**: complete (#22, #24, #26, #27, #30–#34, #39, #41–#43, #45, #48).
- **Docs/chores**: D11 recorded (#44); repo and CI maintenance (#23, #29, #35–#38, #40, #52); Electron install documented and verified on a cold install (#59).
- **Merged M2/M4 tickets**: M2-01 (#49), M2-02 (#46), M2-03 (#51), M2-04 (#53), M2-06 (#60), M4-01 (#54), M4-03 (#47), M4-04 (#50), M4-07 (#56), M4-08 (#64).
- **Merged M2/M4 tickets**: M2-01 (#49), M2-02 (#46), M2-03 (#51), M2-04 (#53), M2-06 (#60), M2-07 (#75), M4-01 (#54), M4-03 (#47), M4-04 (#50), M4-07 (#56), M4-08 (#64).
- **M4-09 Responsive layout** (sidebar, icon rail, bottom tabs, account switcher, hidden empty categories): done with #70. Known gaps (decided): the Overview was not scoped to the account switcher (fixed in M4-14), and the Topics group is not shown because no topic data exists yet.
- **M4-14 Overview while sorting: live numbers**: done with #71. Scoped by the account switcher (`?account=`); Pause/Resume state comes from the worker (`scan.status`). Unmet acceptance criteria, owned elsewhere: the 7 waiting / 3 deadlines / 12 important golden is an accepted gap until the M3 detectors (decided 2026-11-19); the emails-archived and attachments-saved figures wait for M2-20 (entity `sizeBytes`, persistence, fixtures), so Clean up shows email counts — archiving does not free mailbox space; View summary stays with M4-15. There is no Storybook story of the screen (it needs the worker); the pieces have their own stories.
- **M4-16 Required states**: 8 states (sign-in cancelled, offline status line, needs reconnecting, model download failed, rate limit, empty category, nothing to do, update ready) composed from `EmptyState` with en/fr/ja copy, an event reducer for worker-event triggers and light/dark stories. Done with #74.
- **M4-05 Responsive sheet**: one reusable `Sheet` primitive in packages/ui (centred on desktop, bottom sheet below 560px, standard enter motion); the summary content is composed in M4-15. Done with #73.
- **M4-06 Mascot behaviours**: done with #57 (merge pending).
- **M4-10 Welcome screen and onboarding stepper**: done except the visual-tolerance check against the light reference, deferred to M4-19; shared onboarding layout keeps Pochi and the step indicator in place across Welcome, Connect and Set up.
- **M4-17 Motion catalog**: central timings in `lib/motion.ts` (test-pinned to Motion.dc.html), `useMotionEnabled` + `MotionProvider` (reduced motion or Animations off make everything instant), count-up, storage settle, row fold + `undoToast`, finding slide-up, check draw, replayable stories under Motion/Catalog. Done with the M4-17 PR.
- **M4-18 Dev gallery**: `/gallery` route listing every required state and motion moment (the same stories, no copies) with theme and reduced-motion toggles; present only in `electron-vite dev` and E2E builds (`POCHIMAIL_E2E=1`), compiled out of production bundles via the `__POCHIMAIL_GALLERY__` build-time flag (test builds the bundle and checks). Also fixed a conditional hook in `useMotionEnabled` that crashed motion components when Animations was flipped at runtime. Done with #77.
- **M4-13 Setup screen** (capabilities as checkbox cards, autonomy as radio cards, Start sorting saves settings and starts the scan): done with #72. Settings now carry `autonomy` (just-look/suggest/autopilot) and per-capability flags in place of the single `autopilot` boolean; the existing `settings.update` patch is the save call.
- **M2-08 Recorded fixtures**: dev/test-only harness in `@pochimail/testing/recorded/*`: HTTP record/replay as the `HttpClient` transport (allow-list still applies; scripted 429/`Retry-After`, expired cursor, dropped connection), a scripted IMAP server on 127.0.0.1 (LIST, SELECT/QRESYNC, FETCH, STORE, MOVE, IDLE; UIDVALIDITY change, dropped socket), a scrub check for tokens and real-looking addresses, and a shared protocol contract (Gmail, Graph, IMAP yield the same `IncomingMessage` set). A test fails if production source imports it. Done with #78.
- **M2-05 OAuth PKCE loopback sign-in**: done with #66 (merge pending; wired into the Connect screen by M4-12).
- **i18n: French + Japanese**: done with #62 (typed fr/ja catalogs, locale resolution, locale plural/number/date rules).
- **Refactor**: UI component rule cleanup (ui-audit-20261119 items 1–4,8): undo toast replaced by sonner toast + action with `once` helper, status-strip/dialog composition, review labels required, storage-bar/i18n copy cleanup (#61).

## In progress

- **M4-02** worker composition root and model host: in review (PR pending merge).

## Next

Ordered by priority (UI first):

1. **M4 UI**: the remaining M4 tickets (M4-15 View summary, M4-19 visual tests).
2. **M2 lane**: M2-05 onward (see [`docs/tickets/m2-m4-lanes.md`](tickets/m2-m4-lanes.md)).
3. **M2-20 Overview figures**: emails archived (and could-be-archived), attachments saved (count + size), newsletters unsubscribed (see [`M2-20`](tickets/M2-20.md)); blocked by M4-14 and this docs PR.

## Open decisions

- **Product framing (decided 2026-11-19)**: recorded in brief §1–2 and §7, `docs/design.md`, plan D16/D17 and ADR 0010 (Accepted). Saved attachments: user chooses local or drive; Pochimail picks a starting folder, tidies it, and naming is one setting with a sensible default (the maintainer confirmed). **Proposed (maintainer to confirm):** provider labels for Review lists. The overview storage bar stays OPEN (below).
- **Overview storage bar (decided 2026-11-19)**: after the figures change, what does it show — or is it dropped? **OPEN for the maintainer**; do not invent a meaning (brief §7.4, docs/design.md).
- **Demo mode in packaged builds (M4-02)**: resolved by D13 (decided 2026-11-19) — fixtures and demo data (`POCHIMAIL_DEMO`, fixture mailbox, `packages/testing`) are for developers and contributors only, excluded from production builds at build time (not just gated at runtime), so the shipped app stays light.
- Resolved planning questions are recorded in [`docs/tickets/m2-m4-lanes.md`](tickets/m2-m4-lanes.md).

## Known follow-ups

- **Message size / Overview figures**: M2-20 owns attachment metadata (`sizeBytes` on Message, persistence, fixtures, archived counts) and replaces the earlier proposed "message size" ticket; archiving does not free mailbox space (no 'freeable GB').
- **Demo Overview count vs reference (7 people waiting / 3 deadlines / 12 important)**: accepted until the M3 detectors land (decided 2026-11-19); do not change the numbers.
- **M3**: needs-reply detector has no age window; current precision 0.26. Decision 2026-11-19: old conversations never count as "waiting on you" — only recent threads whose last message is from a real person to you, with a configurable age window (default set in M3; see E3, plan D15). The Overview's `toReview` over the small fixture is 56, not 7 + 3 + 12 = 22: needs-reply 45 (7 expected: the scan stores no threads, so every inbound people email counts as last in its thread, and there is no age window), time-sensitive 11 (3: the deadline word list also matches ordinary mail), important-sender 0 (12: nothing in the scan records VIP or reply counts per sender). Needs real detector work (M3).
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
