# 0004 — Incremental sync, wake-ups and the IMAP connector

Status: Accepted (2026-11-17, maintainer, M0-15) · Brief: §5.3 › Incremental sync, Provider efficiency; §4 (D4 any provider); §9 risks · Research: M0-13

## Decision
**One `MailProvider` port, three adapters**, each declaring capabilities (`labels` vs `folders`, `archive` semantics, `batchModify`, `deltaSync`, `pushWakeups`, `unsubscribeSend`).

| Provider | Data source | Cursor | Archive / organize | Wake-up |
|---|---|---|---|---|
| Gmail | Gmail API (`history.list`, batch endpoints) | `historyId` (full re-list when expired) | remove `INBOX` label; labels | polling by default in v1; IMAP IDLE only as opt-in "real-time updates", which may be dropped (needs `https://mail.google.com/`, broader scope) |
| Microsoft | Graph (`/messages/delta`, `$batch`) | delta token per folder | move to Archive folder; Outlook categories | polling; IMAP IDLE opt-in (`IMAP.AccessAsUser.All`), off if tenant disabled IMAP |
| IMAP (generic + presets) | `imapflow` + `mailparser` | `UIDVALIDITY` + `HIGHESTMODSEQ` (CONDSTORE/QRESYNC), UID-range fallback | move to `\Archive` special-use folder (create "Archive" if absent); topics/categories as IMAP keywords when `PERMANENTFLAGS` allows `\*`, else folders under `Pochimail/` (opt-in) | IDLE on INBOX (standard for IMAP accounts) |

- **Headers first**; bodies, snippets and attachments fetched lazily when a signal needs them.
- **Provider presets** (Yahoo, iCloud, Fastmail, GMX, Zoho, AOL…): host/port/auth method from a **bundled snapshot of Thunderbird's ISPDB** (no runtime lookup = no extra host): bundle only the presets we support, keep the original headers, add a third-party notice (decided 2026-11-17; data-file licence still to confirm, checklist I1). **Yahoo**: app password first, OAuth only if Yahoo approves later. **iCloud**: app-specific password only, `imap.mail.me.com:993`, SMTP `smtp.mail.me.com:587`. Unknown domains: MX lookup is avoided (network), so the user enters host/port with sensible defaults.
- **Adaptive polling**: ~1 min while the window is focused, ~5 min when visible but idle, cadence-driven (Keep it tidy) when hidden; paused on sleep/offline/battery saver.
- **IDLE**: re-issued every ~25 min, reconnect with backoff + jitter, paused on sleep/offline; only signals "changed", then a delta sync runs.
- **Rate limits**: per-account token bucket (Gmail: counted in quota units, not requests; see research findings), honor `Retry-After`, exponential backoff + jitter, emit a `RateLimited{resumeAt}` state for the UI.
- **Resumability**: sync cursors and page tokens persist in the job payload; a restart resumes mid-backfill.
- **First sync** walks newest → oldest so the Overview fills with recent mail first.
- Optional privacy relay for Gmail Pub/Sub / Graph webhooks stays **v1.x, off by default**.

## Consequences
IMAP has no native labels: "Organize" on IMAP accounts is keywords (invisible in some clients) or folders (visible but moves mail). The UI says which one applies. Network allowlist includes the IMAP/SMTP hosts of connected accounts only.

## Research findings (M0-13, 2026-11-17)
Full sources and dates: [docs/security/oauth-verification.md](../security/oauth-verification.md).
- **Gmail quotas** (quota page, changed 2026-05-01): 6,000 units/min/user, 1,200,000 units/min/project. Costs: `messages.get` 20, `list` 5, `history.list` 2, `batchModify` 50 (1000 ids max). Batch max 100 calls, recommended 50, and a batch counts as n calls. The rate-limit bullet above is updated accordingly. First sync of a large mailbox takes hours; the UI shows real progress.
- **Gmail history** is "typically available for at least one week"; a stale `historyId` returns 404 and forces a full sync (as designed).
- **Graph**: `$batch` max 20 requests, each throttled individually; Outlook limits per app and mailbox 10,000 requests / 10 min, 4 concurrent (wording unconfirmed, re-read in M2). Delta token expiry is not documented: always keep the full-walk fallback.
- **IDLE on Gmail** needs the restricted `https://mail.google.com/` scope and may not pass verification: stays opt-in, may be dropped (checklist G6).
- **Yahoo** IMAP uses XOAUTH2 (OAUTHBEARER also supported); mail scopes need an approval, so Yahoo starts as app password. **iCloud**: app-specific passwords only, `imap.mail.me.com:993`, `smtp.mail.me.com:587`, no POP.
- **ISPDB** is MPL-2.0 (repo level; data-file terms not stated): bundle only the presets we support, keep original headers, add a third-party notice (checklist I1).

## To verify (remaining, tracked in the M2/M8 checklist in [docs/security/oauth-verification.md](../security/oauth-verification.md#6-verification-checklist-draft-issue-for-m2--m8))
Google's answer on IDLE scope for an opt-in feature (G6); Microsoft Outlook limits verbatim and delta token lifetime (M5, M6); Yahoo XOAUTH2/OAUTHBEARER with `imapflow` (Y3); ISPDB data-file licence (I1).
