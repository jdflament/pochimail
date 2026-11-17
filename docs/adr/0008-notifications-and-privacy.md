# 0008 — Notifications and privacy

Status: Proposed · Brief: §5.5, §5.10 › Privacy by default, §7c › Notifications

## Decision
- **Notifier port** with a desktop adapter (Electron `Notification`, OS-native grouping) and an in-app notification center stored in the DB.
- **Kinds**: sorting finished, digest ready, Autopilot report, account needs reconnecting, update ready.
- **Privacy default**: notifications contain **counts only** ("3 people are waiting on you, 1 deadline Friday"); names/subjects only if "Show names and subjects" is on.
- **Coalescing**: one notification per kind per window (default 15 min); digests replace earlier undelivered ones; never more than N per day.
- **Quiet hours** (default 22:00–08:00): held, then coalesced into one on exit.
- Clicking a notification opens the matching sheet/screen (summary, review list).
- **No telemetry, no crash reporting in v1** (P11); logs are local, structured, redacted (no addresses, subjects, bodies, attachment names), rotated; an "Export diagnostics" button produces a redacted bundle the user can attach to an issue.
- **Network allowlist** enforced with `session.webRequest` in every session + the worker's HTTP client: Google/Microsoft APIs, connected IMAP/SMTP hosts, GitHub Releases, the model host(s), and — if P1 is accepted — the single one-click unsubscribe POST path. Every host documented in `docs/security/network.md`.
- Remote push (relay) stays v1.x, off by default.
