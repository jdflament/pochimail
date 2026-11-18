# M2 + M4 order (drafts; M1-xx merged count as done; M1-14 is running)

M2 = 19 tickets, M4 = 20 tickets. SENSITIVE: M2-01, 03, 04, 05, 06, 09, 10, 11, 12 · M4-01, 02, 20.

## Lanes
**M2**
- A storage: M2-01 (db core) ∥ M2-02 (core follow-ups) → M2-03 (repos+FTS) → M2-14 (multi-account, also needs M2-09) → M2-18 (restart-resume, also M1-14, M2-09)
- B secrets/auth: M2-04 (SecretStore) → M2-05 (OAuth PKCE)
- C network/providers: M2-06 (egress+HttpClient) → M2-07 (rate limit), M2-08 (fixtures harness, also M1 merged) → M2-09 Gmail (needs M2-05) ∥ M2-10 Graph (needs M2-05) ∥ M2-11 IMAP read → M2-12 IMAP actions, M2-13 presets
- D runtime: M1-14 → M2-15 (polling) → M2-16 (IDLE, also M2-11), M2-17 (offline + queued actions, also M2-15)
- E ops: M2-19 (verification kick-off, no deps, start now)

**M4** (no real accounts; fixtures)
- A IPC/worker: M4-01 → M4-02 (also M1-14) 
- B ui components: M4-03 ∥ M4-04 ∥ M4-06 (no deps) → M4-05 (needs M4-04) → M4-17 motion (needs 03, 04, 05, 06)
- C shell: M4-07 (i18n) ∥ M4-01 → M4-08 → M4-09 (needs M4-03)
- D screens: M4-10 Welcome (04, 06, 08) → M4-12 Connect (10, 11, 02) → M4-13 Setup (04, 10, 02) → M4-14 Overview (02, 03, 08, 09) → M4-15 Summary (05, 14)
- E design: M4-11 (P8 draft, JD approves) → M4-12, M4-20
- F states/test: M4-16 (04, 08) → M4-18 gallery (16, 17) → M4-19 Playwright (15, 18); M4-20 (M2-04, M4-01, M4-11)

## First wave (can start at once)
M2-01, M2-02, M2-04, M2-06, M2-19 · M4-01, M4-03, M4-04, M4-06, M4-07, M4-11
(M1-14 finishing unlocks M2-15, M2-17, M4-02. M2-08 and M2-07 follow M2-06.)

## Brief/plan contradictions
- Brief §5.3 says tRPC subscriptions; ADR 0002 chose an in-house typed RPC (tickets follow the ADR).
- Brief §5.3 makes IMAP IDLE the general wake-up; ADR 0004 makes it default only for IMAP accounts, Gmail/Graph opt-in and possibly dropped.
- Required states: brief §6 lists "nothing to do", brief "States and motion"/design.md list "update ready"; both are 7. M4-16 builds the design.md/06-states.png set.
- E2 "offline queued actions" and E5 "offline action queue" overlap (M2-17 owns queue+replay, M5 only UI).
- Plan numbering (M4-01 = IPC, M4-03 = ui) differs from E4's child order; tickets follow the plan.
- Responsive <560px layout is unreachable in a desktop window (min 720×560); it is tested via Storybook/containers only.
- Brief §7 summary now shows attachments saved (JD 2026-11-19); real attachment metadata is M2-20, not M6 documents (M4 uses a fixture value).
- E2 says pipeline wiring was unmentioned; assigned to M1-14, so no M2 ticket for it.

## Open questions for JD
1. How does packages/testing (fixtures) ship for M4 demo mode in a packaged build, or is it dev/E2E only?
2. Required states: design.md set (update ready) or brief §6 set (nothing to do), or both (8)?
3. Gmail/Graph IDLE opt-in (M2-16): build the flag now or drop it until Google answers G6?

## JD answers (2026-11-18)
1. Demo mode / fixtures: development and tests only; never shipped in the packaged app.
3. Gmail/Graph instant (IDLE-style) wake-ups: later. M2-16 builds IMAP IDLE only; no Gmail/Graph flag now.
2. Required states: BOTH = 8 (JD 2026-11-18). M4-16 builds 8; "Nothing to do" has no design: derive copy + pose from "Empty category" style, show it in the gallery for JD review.

## JD answers (2026-11-19)
1. Fixtures/demo data refine the 2026-11-18 answer: for **developers and contributors only**, excluded from production builds **at build time**, not gated at runtime, so the shipped app stays light (D13, AGENTS.md §5).
2. Overview/Summary figures are emails archived (and could-be-archived), attachments saved (count + size), newsletters unsubscribed; archiving does not free mailbox space, so no "GB you can free"/"freeable" copy (D12, M2-20).
3. OPEN for JD: what the Overview storage bar shows, or drop it; do not invent a meaning. Demo Overview counts (7/3/12 vs 56) are an accepted gap until M3 detectors — do not change the numbers.
4. Product priority (addendum 2026-11-19): the four jobs (save/export attachments, unsubscribe, archive, categorize) are core; "Catch what matters" signals are secondary (D14, brief §1-2).
5. Date-aware signals (addendum 2026-11-19): old conversations never count as "waiting on you"; only recent threads whose last message is from a real person to you, with a configurable age window (default set in M3; D15, E3).
6. Review lists (addendum 2026-11-19, proposed/JD to confirm): metadata-only lists (sender, subject, date, snippet), "Open in Gmail/Outlook/mail app", body preview fetched on demand in memory only (brief §7, ADR 0009).
