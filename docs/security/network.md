# Network inventory

Ticket M0-16 · Written 2026-11-17 · Sources: brief [§5.10](../brief.md) (No network except), [ADR 0004](../adr/0004-incremental-sync-and-imap.md), [0006](../adr/0006-local-ai-runtimes-and-models.md), [0007](../adr/0007-oauth-credentials-scopes.md), [0008](../adr/0008-notifications-and-privacy.md), [OAuth findings](oauth-verification.md), plan P1, P3, P11 · Companion: [threat model](threat-model.md).

Rule: **the app contacts only the hosts below.** A session-level request filter (`session.webRequest` in every Electron session) enforces it for requests Electron sees, and the worker's HTTP client enforces it for HTTP(S). Raw IMAP/SMTP sockets are not visible to either: those clients (M2-11/12) must open sockets only through `assertSocketAllowed(host, port)` from the shared allow-list. Everything else is blocked. Adding a host means adding a row here, updating the threat model and asking the maintainer first (AGENTS.md section 11). No telemetry, no crash reporting (P11), no analytics, no fonts or scripts from CDNs (fonts are self-hosted). Update and model requests carry no identifiers.

Mitigation links point to Project "Pochimail v1" Draft IDs (`E2` = "Epic: M2 Accounts & sync", etc.; see the [threat model](threat-model.md)) or ADRs.

Status: **v0; H1–H5 are enforced since M2-06** (shared host registry, worker HTTP client and main session filter). M2-05's OAuth token and revocation calls (H2, H3, H5) go through that client; the loopback redirect (L1) is implemented too. H6/H7 endpoints are registered on connect and checked by the socket guard that IMAP/SMTP clients must use. Hosts marked *to confirm* come from a provider page that was summarised, not read verbatim, or from a decision still open; each names where it gets confirmed.

## 1. Always-on, by feature

| # | Host (pattern) | Process | When | Why | Data sent | Confirmed in |
|---|---|---|---|---|---|---|
| H1 | `gmail.googleapis.com` | worker | Gmail account connected | Mail API: list, get, history, batchModify, labels | OAuth access token; message ids and label changes | E2 · [ADR 0004](../adr/0004-incremental-sync-and-imap.md) · checklist G7 |
| H2 | `oauth2.googleapis.com` | worker | Gmail sign-in, token refresh | Exchange code (PKCE) and refresh tokens | client ID, code and verifier, refresh token | E2 · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) · *to confirm* G5 |
| H3 | `oauth2.googleapis.com` (`/revoke`) | worker | Remove account | Revoke the token at the provider | the token | E2 · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| H4 | `graph.microsoft.com` | worker | Microsoft account connected | Graph mail: delta, `$batch`, move to Archive, categories | access token; message ids | E2 · [ADR 0004](../adr/0004-incremental-sync-and-imap.md) |
| H5 | `login.microsoftonline.com` | worker | Microsoft sign-in, refresh | Authorization-code + PKCE token endpoint (`/common` or `/consumers` / tenant); **no revocation call** (see note) | client ID, code and verifier, refresh token | E2 · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) · *to confirm* M4 |
| H6 | IMAP host of each connected account (e.g. `imap.mail.me.com:993`, Yahoo, Fastmail, GMX...) | worker | IMAP account connected | Sync, move to `\Archive`, keywords, IDLE | password or XOAUTH2 token over TLS | E2 · [ADR 0004](../adr/0004-incremental-sync-and-imap.md) |
| H7 | SMTP host of each connected account (e.g. `smtp.mail.me.com:587`) | worker | Only if the user opts in to `mailto:` unsubscribe by send (P2) | Send the unsubscribe message | the prepared message | E2 · E5 · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| H8 | `github.com` and `release-assets.githubusercontent.com` (GitHub Releases; exact hosts, no wildcard) | main (updater) | Update check, update download | `electron-updater` metadata and installers, signed | none (no identifiers, no account) | E8 (*to confirm in M8: exact host list electron-updater uses; on 2026-11-17 a release download redirected to `release-assets.githubusercontent.com`, formerly `objects.githubusercontent.com`; add the legacy host only if still observed*) · [brief §5.7](../brief.md) |
| H9 | Model manifest on GitHub Releases (same hosts as H8) | worker | First launch and model updates | Signed manifest with model files and SHA-256 | none | E3 · E8 · plan P3 · [ADR 0006](../adr/0006-local-ai-runtimes-and-models.md) |
| H10 | `huggingface.co` and `us.aws.cdn.hf.co` (exact names, no wildcard; accepted 2026-11-17); fallback: our GitHub Releases | worker | Model download (hardware tier) | Fetch model files, resumable, SHA-256 verified | none | E3 · plan P3 · [ADR 0006](../adr/0006-local-ai-runtimes-and-models.md) · re-check the CDN name when the downloader is built (if it changes, the allow-list needs a release) |

Notes:
- H1, H4 and H6 are the only places mail content crosses the network, and only between the device and the provider the user connected. Pochimail never sends mail content anywhere else.
- Yahoo OAuth hosts are not listed: they are added as new rows **only if** Yahoo approves OAuth (checklist Y1 to Y3). Until then Yahoo is an app password to its IMAP host (H6).
- **ISPDB presets are bundled** ([ADR 0004](../adr/0004-incremental-sync-and-imap.md)): there is no runtime autoconfig lookup, no MX lookup and no host in this table for it.
- The OAuth sign-in page itself opens in the **system browser**, so the provider's login and consent pages (`accounts.google.com`, and `login.microsoftonline.com` for the sign-in page) are loaded by the user's browser, not by Pochimail's sessions, so `accounts.google.com` is not in the app's allowlist. `login.microsoftonline.com` is allowlisted only for the token calls the worker makes (H5), not for the sign-in page. The loopback redirect is local (section 3).
- Revocation: Google revokes at H3 (implemented in M2-05). Microsoft identity platform v2.0 documents **no per-app user-token revocation endpoint** (confirmed in M2-05), so removing a Microsoft account deletes its credentials locally only; there is no H5 revocation call to add. Yahoo revocation is settled only if Yahoo OAuth is approved (Y1–Y3). Checklist X3 asks this file to list token and revocation hosts per provider.

## 2. The single exception (plan P1)

| # | Host | Process | When | Why | Data sent |
|---|---|---|---|---|---|
| X1 | The exact HTTPS URL found in a message's `List-Unsubscribe` header (any sender host) | worker, one dedicated path | The user confirmed an unsubscribe in a reviewed batch, and the message has `List-Unsubscribe-Post: List-Unsubscribe=One-Click` | RFC 8058 one-click unsubscribe | POST body `List-Unsubscribe=One-Click` only |

**Status: ACCEPTED by the maintainer on 2026-11-17 (plan P1).** If it is ever withdrawn, delete X1: unsubscribe is then `mailto:` only (P2).

Conditions (full reasoning in [threat model section 6](threat-model.md#6-plan-p1-one-click-unsubscribe-path-documented-exception)): exact URL only, `https` only, no cookies, no redirects followed, no custom headers or `Referer`, not an IP literal or a private/loopback/`localhost` address, short timeout, response discarded, every call logged without the address, built in E5 (unsubscribe), no other code may use this bypass.

## 3. Local network (not outbound)

| # | Endpoint | Process | Why |
|---|---|---|---|
| L1 | `http://127.0.0.1:<random port>` | worker (or main) | OAuth loopback redirect; bound to `127.0.0.1` only, `state` checked, closes after one request ([ADR 0007](../adr/0007-oauth-credentials-scopes.md)). Implemented (M2-05): a fresh random port per sign-in, one request only, closed on the callback, on cancel and on timeout |
| L2 | `MessageChannelMain` ports | main, renderer, worker, model host | IPC; in-process, not sockets ([ADR 0002](../adr/0002-electron-process-model-and-ipc.md)) |

In development only, the Vite dev server on `localhost` serves the renderer; it is not part of a packaged build and is not in the allowlist there.

## 4. Explicitly not used

Telemetry or analytics, crash reporting (P11, deferred to v1.x), remote push relay or Gmail Pub/Sub / Graph webhooks (v1.x, off by default), cloud AI or any inference over the network, remote images or fonts in email content, link following in email bodies, MX or autoconfig lookups, license or account servers. A fork or a future feature that needs one of these must change this file and the threat model.

## 5. Enforcement and tests

| Control | Where built |
|---|---|
| `session.webRequest` filter on every session, deny by default; renderer sessions allow no remote host at all (CSP `default-src 'self'` plus the filter). Main reads the shared registry's `hosts()` snapshot. | E2 · M0-09 (CSP) · M2-06 |
| Worker HTTP client and main filter create their instances from one policy source (`egressPolicy` in `@pochimail/mail/egress/allowlist`), so static H1–H5 hosts and normalisation are identical in both processes. No wildcard or suffix match, no plaintext HTTP; blocked requests log the host only. X1 is deliberately excluded. | E2 · M2-06 |
| Connected IMAP/SMTP host:port endpoints (H6/H7) are added on connect and removed on account removal. Because Electron's filter and the HTTP client cannot see raw sockets, IMAP/SMTP clients (M2-11/12) **must** call `assertSocketAllowed(host, port)` from the same allow-list before opening a socket; it throws a typed `BlockedSocketError`. A registry alone does not enforce socket egress. | E2 · M2-06 · M2-11/12 |
| A test asserts a request to an unlisted host (including a lookalike host) is blocked before a network call; contract checks cover account socket add/remove via the guard, ports, `AbortSignal` cancellation, timeouts that win even against a transport that ignores the signal, redirects and host-only logs. The one-click path still needs its own tests for `http`, private addresses and a URL different from the header. | E2 · M2-06 · E5 |
| The static hosts in code live in one `STATIC_EGRESS_HOSTS` list mapped to rows H1–H5 and are reached through `egressPolicy`; the CI check for every host in code is still planned. | E2 |
| Model host has no HTTP client and no network permission | E3 · E4 |
