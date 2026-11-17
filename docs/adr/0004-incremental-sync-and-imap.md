# 0004 — Incremental sync, wake-ups and the IMAP connector

Status: Proposed · Brief: §5.3 › Incremental sync, Provider efficiency; §4 (D4 any provider); §9 risks · Research: M0-13

## Decision
**One `MailProvider` port, three adapters**, each declaring capabilities (`labels` vs `folders`, `archive` semantics, `batchModify`, `deltaSync`, `pushWakeups`, `unsubscribeSend`).

| Provider | Data source | Cursor | Archive / organize | Wake-up |
|---|---|---|---|---|
| Gmail | Gmail API (`history.list`, batch endpoints) | `historyId` (full re-list when expired) | remove `INBOX` label; labels | polling; IMAP IDLE only as opt-in "real-time updates" (needs `https://mail.google.com/`, broader scope) |
| Microsoft | Graph (`/messages/delta`, `$batch`) | delta token per folder | move to Archive folder; Outlook categories | polling; IMAP IDLE opt-in (`IMAP.AccessAsUser.All`), off if tenant disabled IMAP |
| IMAP (generic + presets) | `imapflow` + `mailparser` | `UIDVALIDITY` + `HIGHESTMODSEQ` (CONDSTORE/QRESYNC), UID-range fallback | move to `\Archive` special-use folder (create "Archive" if absent); topics/categories as IMAP keywords when `PERMANENTFLAGS` allows `\*`, else folders under `Pochimail/` (opt-in) | IDLE on INBOX (standard for IMAP accounts) |

- **Headers first**; bodies, snippets and attachments fetched lazily when a signal needs them.
- **Provider presets** (Yahoo, iCloud, Fastmail, GMX, Zoho, AOL…): host/port/auth method from a **bundled snapshot of Thunderbird's ISPDB** (no runtime lookup = no extra host). Unknown domains: MX lookup is avoided (network), so the user enters host/port with sensible defaults.
- **Adaptive polling**: ~1 min while the window is focused, ~5 min when visible but idle, cadence-driven (Keep it tidy) when hidden; paused on sleep/offline/battery saver.
- **IDLE**: re-issued every ~25 min, reconnect with backoff + jitter, paused on sleep/offline; only signals "changed", then a delta sync runs.
- **Rate limits**: per-account token bucket, honor `Retry-After`, exponential backoff + jitter, emit a `RateLimited{resumeAt}` state for the UI.
- **Resumability**: sync cursors and page tokens persist in the job payload; a restart resumes mid-backfill.
- **First sync** walks newest → oldest so the Overview fills with recent mail first.
- Optional privacy relay for Gmail Pub/Sub / Graph webhooks stays **v1.x, off by default**.

## Consequences
IMAP has no native labels: "Organize" on IMAP accounts is keywords (invisible in some clients) or folders (visible but moves mail). The UI says which one applies. Network allowlist includes the IMAP/SMTP hosts of connected accounts only.

## To verify
Gmail/Graph quotas and batch limits today; Yahoo OAuth for IMAP (developer approval, scopes); iCloud requires app-specific passwords; whether Google accepts IMAP scope in verification for an opt-in feature; ISPDB license for bundling.
