# Threat model v0

Ticket M0-16 · Written 2026-11-17 · Sources: brief [§5.4](../brief.md), [§5.10](../brief.md), ADRs [0002](../adr/0002-electron-process-model-and-ipc.md), [0004](../adr/0004-incremental-sync-and-imap.md), [0005](../adr/0005-local-storage.md), [0007](../adr/0007-oauth-credentials-scopes.md), [0008](../adr/0008-notifications-and-privacy.md), [OAuth findings](oauth-verification.md) · Companion: [network inventory](network.md).

This is v0: it is written before the code exists, so most mitigations are **planned**. Each row names the draft that will build it. It is revised in M8 (E8 "threat model final") before the external security review.

## How mitigations are referenced

There are no GitHub issues yet, so every mitigation links to a **Project "Pochimail v1" Draft ID** or to an **ADR** (or both). Drafts: `M0-nn` / `M1-nn` are individual drafts; `E2`..`E8` are the milestone epics (title "Epic: M2 Accounts & sync" etc.), whose planned children are listed in `docs/plan.md` and the epic body. When a draft becomes an issue, replace the Draft ID by the issue number in the same PR (AGENTS.md section 10). A mitigation marked **Accepted risk** has no draft: the risk and why we accept it are written next to it.

## 1. Scope and assumptions

- Pochimail is a local-only desktop app (no backend, no telemetry, local AI only). The only data leaving the device is traffic to the mail providers the user connected, update checks, model downloads (`huggingface.co`, `us.aws.cdn.hf.co`) and one-click unsubscribe POSTs (plan P1, accepted 2026-11-17) ([network.md](network.md)).
- **Out of scope for v0**: a compromised OS account or a running keylogger/malware with the user's privileges (it can read the unlocked keychain and memory; we do not claim to defend against it), physical attack on an unlocked machine, compromise of the mail providers themselves, denial of service by a provider.
- Plan decisions P1 to P15 and ADRs 0001 to 0008 were accepted by the maintainer on 2026-11-17 (M0-15).

## 2. Assets

| # | Asset | Where it lives | Why it matters |
|---|---|---|---|
| A1 | Mail content and metadata (headers, metadata, derived data, short snippets; bodies are never persisted, D11) | Encrypted SQLite, worker process ([ADR 0005](../adr/0005-local-storage.md)) | The user's whole private life; the product's reason to exist |
| A2 | Attachments and extracted documents | Encrypted content-addressed blob store, AES-256-GCM ([ADR 0005](../adr/0005-local-storage.md)); plaintext only on user export | IDs, contracts, payslips |
| A3 | OAuth refresh tokens, IMAP app passwords | OS keychain via `SecretStore` / `safeStorage` ([ADR 0007](../adr/0007-oauth-credentials-scopes.md)) | Full mailbox access at the provider, outside the device |
| A4 | Access tokens | Worker memory only | Short-lived mailbox access |
| A5 | Database key | `safeStorage`-encrypted ([ADR 0005](../adr/0005-local-storage.md)) | Unlocks A1, A2 |
| A6 | Action log and learned model state (user corrections, embeddings, topics) | Encrypted SQLite | Reveals habits and relationships; integrity decides what we archive |
| A7 | Mailbox integrity (mail is never deleted; archive and labels are undoable) | At the provider | Product invariant ([AGENTS.md](../../AGENTS.md) section 2) |
| A8 | Local AI models | App data dir, SHA-256 pinned ([ADR 0006](../adr/0006-local-ai-runtimes-and-models.md)) | A swapped model could mis-sort or crash the host |
| A9 | The app binary and its update channel | Signed builds, GitHub Releases | Whoever controls updates controls A1 to A5 |
| A10 | OAuth client IDs and the verified-app status | Build config, provider consoles | Losing verification breaks sign-in for every user |
| A11 | Logs and diagnostics export | Local files | Easy place to leak A1 by accident |

## 3. Actors

| Actor | Capability | Goal |
|---|---|---|
| T1 Malicious email sender | Controls every byte of an email (headers, HTML, attachments, `List-Unsubscribe`, links, text aimed at the LLM) | Execute code, track the user, exfiltrate data, trigger unwanted actions |
| T2 Network attacker | On-path or hostile network (cafe Wi-Fi, bad proxy) | Intercept tokens or mail, tamper with updates and models, downgrade TLS |
| T3 Other local process / other OS user | Reads files the user can read; same user can talk to loopback ports | Steal the database, tokens, or the OAuth code during sign-in |
| T4 Supply-chain attacker | Compromises an npm dependency, a build tool, a model file or a release | Run code in our processes with A1 to A5 |
| T5 Malicious or fork app | Phishing app that imitates Pochimail's consent screen, or a fork reusing our client ID | Obtain tokens from users |
| T6 Curious or careless user / support flow | Shares logs, screenshots, diagnostics | Accidental disclosure of A1 |
| T7 The assistant itself (bug or model error) | Wrong classification, runaway batch | Archive People mail, bad Autopilot batch (A7) |
| T8 Provider policy change | Revokes scopes, changes quotas, ends app approval | Takes the product down without an attacker |

## 4. Trust boundaries

```
 internet (providers, GitHub, model hosts, sender URLs)
        ^ TB5 (network filter: allowlist)            ^
 +------+---------------------------+      +---------+--------+
 | main (no mail data)              |      | system browser   |  TB7  OAuth, loopback
 |  windows, updater, session filter|      +------------------+
 +--+------------------+------------+
    | TB1 MessageChannelMain (port handed over, never proxied)
 +--+-------------+  TB2   +---------------------+  TB3  +----------------+
 | renderer       |<------>| worker (utility)    |<----->| model host     |
 | sandbox, no    | zod    | core, db, mail, ai  |  zod  | node-llama-cpp |
 | Node, CSP      | RPC    | owns DB + tokens    |       | no network     |
 +----------------+        +----+-----------+----+       +----------------+
                                | TB4       | TB6
                          OS keychain    disk (SQLite, blobs, models, logs)
```

| ID | Boundary | Crosses | Rule |
|---|---|---|---|
| TB1 | main to renderer/worker | `MessageChannelMain` ports, preload `contextBridge` | main holds no mail; preload exposes a few narrow capabilities ([ADR 0002](../adr/0002-electron-process-model-and-ipc.md)) |
| TB2 | renderer to worker | typed RPC + subscriptions, zod both sides | Renderer is treated as compromisable by email content; worker validates every input |
| TB3 | worker to model host | `LlmProvider` / `Embedder` ports | Email text is untrusted prompt input; the host has no network and no database |
| TB4 | worker to OS keychain | `SecretStore` port | Secrets only here, never files or logs |
| TB5 | app to internet | session-level request filter + worker HTTP client | Everything outside the allowlist is blocked ([network.md](network.md)) |
| TB6 | worker to disk | SQLCipher DB, encrypted blobs, model files, logs | Encrypted at rest except models and redacted logs |
| TB7 | app to system browser | loopback `127.0.0.1:<random>` redirect | PKCE + `state`, listener closes after one request |
| TB8 | build/release to user | electron-builder, signed update metadata, model manifest | Signed and verified end to end |

## 5. STRIDE

S spoofing · T tampering · R repudiation · I information disclosure · D denial of service · E elevation of privilege. "Draft" = Project draft (see top). Every mitigation below is **planned**: v0 has no code, so none is implemented yet, and the ADRs they cite were accepted on 2026-11-17 (M0-15).

### TB1/TB2 Renderer and IPC

| ID | Cat | Threat | Actor | Mitigation | Draft / ADR |
|---|---|---|---|---|---|
| R1 | E | Email HTML or script runs in the renderer and reaches Node or the worker with full power | T1 | `contextIsolation`, sandbox, no `nodeIntegration`, strict CSP (no remote, no inline script), navigation and `window.open` blocked, permissions denied by default | M0-09 · [ADR 0002](../adr/0002-electron-process-model-and-ipc.md) |
| R2 | E | Renderer sends crafted RPC (huge payload, wrong shape) to the worker | T1 via renderer compromise | zod schema validation on every query, mutation and event on both sides; authorization through one policy function; every entity carries `workspaceId` | E4 (IPC contract) · M1-05 · [ADR 0002](../adr/0002-electron-process-model-and-ipc.md) |
| R3 | E | Wide preload API lets a compromised renderer touch the OS (files, shell) | T1 | preload exposes only the worker port request plus three OS calls via `contextBridge` (snapshot-tested); no generic `ipcRenderer` exposure; open-external limited to `mailto:` and `message:` links; main refuses senders that are not the app page | M0-09 · E4 · [ADR 0002](../adr/0002-electron-process-model-and-ipc.md) |
| R4 | I | Remote content in a preview (images, fonts, CSS) tracks the user and confirms the address is live | T1 | remote content never loaded; text previews first; if HTML is ever shown, sandboxed `<iframe sandbox>` with own CSP and no preload; remote images blocked at the session filter too | E4 · E5 · [ADR 0002](../adr/0002-electron-process-model-and-ipc.md) |
| R5 | T | Clicking a link in an email navigates the app or opens an attacker page | T1 | links in email bodies are never followed; navigation blocked; unsubscribe only via RFC 8058 one-click or `mailto:` | E5 (unsubscribe) · M0-09 · brief §5.10 |
| R6 | E | Fuses left permissive (RunAsNode, unsigned asar) lets a local attacker run code as the app | T3 T4 | Fuses: RunAsNode off, cookie encryption on, ASAR integrity on, only-load-app-from-asar; Electron kept on a supported major | M0-09 · E8 · [ADR 0002](../adr/0002-electron-process-model-and-ipc.md) |
| R7 | D | Renderer floods the worker with queries, blocking sync | T1 | bounded concurrency, batching of events, job queue with cancellation | M1-07 · M1-08 · brief §5.3 |

### TB3 Worker and model host

| ID | Cat | Threat | Actor | Mitigation | Draft / ADR |
|---|---|---|---|---|---|
| W1 | E | Prompt injection: email text steers the LLM into an action ("archive everything", "mark all important") | T1 | LLM only classifies and explains; it never calls tools or actions; output is JSON-schema constrained and zod-validated; actions come from policies and user confirmation, never from model text | E3 (LLM host) · M1-05 · M1-06 · [ADR 0006](../adr/0006-local-ai-runtimes-and-models.md) |
| W2 | E | Malicious attachment or email parser exploit (mailparser, PDF text extraction) | T1 | attachments are hashed and stored only when the user saves them (D11), never opened automatically; parsing in the worker with size and time limits; documents only extracted by libraries kept minimal and updated | E2 · E6 · M0-06 |
| W3 | D | Crafted email or model input crashes or exhausts the model host | T1 | model host is a separate `utilityProcess`; a crash or OOM never takes the worker down; main can restart either | E4 (worker + model host) · [ADR 0002](../adr/0002-electron-process-model-and-ipc.md) |
| W4 | I | Model host or a model leaks mail over the network | T4 | model host has no network permission and no DB access; the session filter and the worker's HTTP client allow only the hosts in [network.md](network.md); local AI only, no inference over the network | E3 · E4 · [ADR 0006](../adr/0006-local-ai-runtimes-and-models.md) · [ADR 0008](../adr/0008-notifications-and-privacy.md) |
| W5 | T | Model poisoning of the learning state by hostile senders ("train" Pochi to trust a sender) | T1 | learning only from explicit user corrections; People mail never auto-actioned; Autopilot limited by strict, per-category policy; everything previewed and undoable | E3 (on-device learning) · E5 (Autopilot) · M1-05 |
| W6 | T | Runaway or wrong batch archives important mail (A7) | T7 | never delete; archive only; preview every batch; People mail only with explicit approval; idempotent actions with stored inverse; undo across restarts | M1-06 · E5 · [ADR 0003](../adr/0003-hexagonal-core-events-outbox.md) |
| W7 | R | No record of what the assistant did | T7 | ActionLog persisted for every action, per action and per batch; Activity & undo screen | M1-06 · E5 |

### TB4/TB6 Secrets and storage

| ID | Cat | Threat | Actor | Mitigation | Draft / ADR |
|---|---|---|---|---|---|
| S1 | I | Database file copied from disk | T3 | SQLCipher-compatible encryption (`better-sqlite3-multiple-ciphers`); random 256-bit key in `safeStorage`; on Linux `basic_text` the key is refused, not written (see S4) | E2 (SQLite adapters) · M0-12 · [ADR 0005](../adr/0005-local-storage.md) |
| S2 | I | Blob store read from disk | T3 | AES-256-GCM per blob with a key derived from the DB key; plaintext only on user export to a chosen folder | E6 · [ADR 0005](../adr/0005-local-storage.md) |
| S3 | I | Refresh token or app password in a file, log, crash dump or the renderer | T3 T6 | tokens only in the keychain via `SecretStore`; access tokens in memory; logger redaction; tokens never cross to renderer. Implemented (M2-04): main wraps each value with async `safeStorage` into `secrets.json`; the worker reaches it over a private main↔worker port that is never given to a WebContents; typed errors carry no key, value or cause; `basic-text` stores nothing until the user opts in (M4-20) | E2 (SecretStore) · M2-04 · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| S4 | I | Linux without a secret service stores the key with the `basic_text` backend, which is weak | T3 | detect the backend; warn in plain language and ask before continuing; **Accepted risk** if the user continues | E2 · [ADR 0005](../adr/0005-local-storage.md) |
| S5 | I | Data survives after "remove account" or "delete all" | T3 T6 | removing an account revokes the token at the provider, deletes keychain entries, rows and unreferenced blobs; "Delete all local data" | E7 (Settings, Privacy & data) · E2 · [ADR 0005](../adr/0005-local-storage.md) · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| S6 | T | Database tampered by a local process (A6, action log) | T3 | **Accepted risk**: a same-user process that can write the file can also read the keychain entry the app can read; encryption gives confidentiality, not integrity against the user's own account. Revisit in the M8 review | M8 review: E8 |
| S7 | I | Swap, hibernation or backups copy decrypted memory or plaintext exports | T3 | **Accepted risk** in v1 (no custom memory locking); exports are explicit, user-chosen, and the UI says so | E7 |

### TB5/TB7 Network, OAuth, providers

| ID | Cat | Threat | Actor | Mitigation | Draft / ADR |
|---|---|---|---|---|---|
| N1 | I | App silently contacts an unlisted host (a dependency phones home, a tracker pixel, a link) | T4 T1 | session-level request filter in every session plus the worker's HTTP client blocks everything not in [network.md](network.md); adding a host requires documenting it and asking | E2 (network allowlist: session filter + worker client) · [ADR 0008](../adr/0008-notifications-and-privacy.md) |
| N2 | I T | Traffic intercepted or downgraded (TLS stripping, hostile proxy) | T2 | TLS only; certificate validation never disabled; IMAP/SMTP require TLS (implicit or STARTTLS enforced, no plaintext fallback); `webSecurity` on | E2 (IMAP provider) · [ADR 0004](../adr/0004-incremental-sync-and-imap.md) · M0-09 |
| N3 | I E | OAuth code stolen by another local process on the loopback port or by a phishing redirect | T3 T5 | authorization code + PKCE in the system browser; random port bound to `127.0.0.1` only; `state` checked; listener closes after one request; cancel and timeout handled | E2 (OAuth PKCE loopback) · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| N4 | S | Phishing app or fork uses our client ID, or users cannot tell real from fake | T5 | client IDs from env/config only, never hard-coded; official builds inject verified IDs, forks register their own; provider verification gives the consent screen a verified publisher | E2 · E8 (OAuth verifications) · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) · [OAuth checklist](oauth-verification.md) |
| N5 | E | Over-broad scope: a token that can do more than the user chose | T7 T5 | least-privilege, incremental scopes: `gmail.readonly` / `Mail.Read` first, modify on autonomy increase, send and IDLE scopes opt-in; never a delete scope; switching autonomy up re-prompts | E2 · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| N6 | I | IMAP app password gives full account access and is typed into our form | T6 T3 | stored only in the keychain; form says honestly what the password allows (not "Pochimail never sees your password"); only for iCloud, other IMAP and Yahoo until OAuth is approved | E2 · E4 (Connect, design P8) · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| N7 | I | One-click unsubscribe POST reveals the user is live to the sender and goes outside the allowlist | T1 | **Explicit exception, plan P1 (accepted 2026-11-17)**, see section 6 | E5 (unsubscribe) · plan P1 |
| N8 | T | Poisoned provider response (hostile or compromised provider, MITM past TLS) breaks the parser or the sync | T2 | zod at every provider boundary; expected failures are `Result` values; adapters tested against recorded fixtures | M1-02 · E2 (recorded fixtures) |
| N9 | D | Provider rate limits or a stale cursor stall sync, or the app hammers the provider and gets blocked | T8 | per-account token bucket in provider units, `Retry-After`, backoff with jitter, `RateLimited{resumeAt}` state; full-resync fallback when a cursor expires | E2 · [ADR 0004](../adr/0004-incremental-sync-and-imap.md) |
| N10 | D | Provider policy change, failed verification or revoked approval stops sign-in | T8 | verification track and checklist started in M2, closed in M8; Gmail IMAP and Yahoo app-password fallbacks documented; reconnect state when refresh fails | E2 · E8 · [OAuth checklist](oauth-verification.md) · [ADR 0007](../adr/0007-oauth-credentials-scopes.md) |
| N11 | I | Update check or model download leaks identifiers | T2 T4 | updates and model manifest fetches send no identifiers; no telemetry; only the hosts in [network.md](network.md) | E8 (updater) · E3 (downloader) · [ADR 0008](../adr/0008-notifications-and-privacy.md) |

### TB8 Supply chain, updates, models

| ID | Cat | Threat | Actor | Mitigation | Draft / ADR |
|---|---|---|---|---|---|
| C1 | T E | Malicious or typosquatted npm package, or a freshly published compromised version | T4 | pinned exact versions and lockfile; reproducible builds where possible (brief §5.10); pnpm `minimumReleaseAge` stays on (no exclusion without an ADR note); minimal dependencies; ask before heavyweight ones | M0-01 · M0-06 · [ADR 0001](../adr/0001-monorepo-and-package-manager.md) |
| C2 | T | Known-vulnerable dependency ships | T4 | Renovate with review; `osv-scanner` / `pnpm audit` in CI; knip removes unused code | M0-04 · M0-06 · M0-05 |
| C3 | T | Release artifact replaced on GitHub Releases or the CI | T4 T2 | signed and notarized builds; signed update metadata; SBOM and checksums per release; npm provenance if packages ever publish | E8 (signing, updater, SBOM) · P10 |
| C4 | T | Tampered or swapped model file | T4 T2 | SHA-256 per file pinned in a manifest signed and published on GitHub Releases (plan P3); resumable downloader verifies before use | E3 (manifest + downloader) · E8 (signed manifest) · [ADR 0006](../adr/0006-local-ai-runtimes-and-models.md) |
| C5 | E | Unsupported Electron/Chromium with known CVEs | T4 | keep Electron on a supported major; Renovate watches it; CI runs a packaging smoke build | M0-06 · M0-10 · E8 |
| C6 | T | Bundled ISPDB preset files with bad or malicious server values | T4 | presets bundled as a snapshot (no runtime lookup); only supported presets; licence notice; host/port facts reviewed | E2 (presets) · [OAuth checklist](oauth-verification.md) I1 |
| C7 | R | No way to report a vulnerability privately | T6 | `SECURITY.md` with a private disclosure address; external security review before 1.0 | M0-03 · E8 (external review, P10) |

### Privacy and logging

| ID | Cat | Threat | Actor | Mitigation | Draft / ADR |
|---|---|---|---|---|---|
| L1 | I | Subjects, addresses, bodies, attachment names or tokens end up in logs, diagnostics or crash output | T6 | structured logger with redaction (never log those fields, never tokens); no crash reporting in v1 (P11); "Export diagnostics" produces a redacted bundle | M1-01 (Logger) · E7 · [ADR 0008](../adr/0008-notifications-and-privacy.md) |
| L2 | I | Native notifications show names or subjects on a locked screen | T6 | counts only by default; names and subjects only when "Show names and subjects" is on | E7 (notifications) · [ADR 0008](../adr/0008-notifications-and-privacy.md) |
| L3 | I | Real mail or addresses leak into fixtures, tests, docs or screenshots in a public repo | T6 | mock dataset only; reviewed in every PR ([AGENTS.md](../../AGENTS.md) section 5) | M1-10 (fixture mailbox) · M0-03 |
| L4 | I | Telemetry or analytics added later, quietly | T4 T6 | none by default; adding an outbound host needs documentation and approval; the network filter would block it | [ADR 0008](../adr/0008-notifications-and-privacy.md) · E2 (network allowlist) |

## 6. Plan P1: one-click unsubscribe path (accepted exception)

**Status: ACCEPTED by the maintainer on 2026-11-17 (plan P1).** An explicit, narrow exception. If it is ever withdrawn, delete this section and the matching row in [network.md](network.md); unsubscribe then falls back to `mailto:` only (plan P2).

Why accept it: RFC 8058 one-click unsubscribe is by definition an HTTPS POST to the sender's own host. Without it, "unsubscribe" would depend on following links in email bodies, which the brief forbids, or on opening mail in a browser.

The exception, in full:
- **One dedicated code path** in the worker (not the renderer, not a generic fetch) built in E5 "unsubscribe". Nothing else may send to a host outside the allowlist.
- **Only** a POST to the **exact `List-Unsubscribe` HTTPS URL** the message carried, with body `List-Unsubscribe=One-Click` per RFC 8058, and only when the message has `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Only after the user confirmed** in a reviewed batch; never in Autopilot without an explicit per-sender approval policy (to be defined in E5).
- **No cookies** (no jar, no credentials), **no redirects followed** (a 3xx is a failure shown to the user), no custom headers beyond the standard ones, no `Referer`, no identifiers, short timeout, TLS validated, response body discarded.
- **Every call logged** in the ActionLog (sender domain, status, time; never the full URL if it contains a token, never the address) so the user can see it and the batch can be reported; failure is a visible state, not retried silently.
- The filter treats this path as the **single allowed bypass**: it is enabled per request with the exact URL, which is checked to be `https`, not an IP literal, not a private or loopback address and not `localhost` (blocks SSRF into the local network).
- **Residual risk (accepted)**: the sender learns that the address is active and the approximate time and IP. The UI states it in the unsubscribe review. A hostile sender can supply a URL that is slow, huge or points to an internal host: covered by the checks and limits above.
- Threats covered: N7 (this exception), R5 (no links in bodies), N1 (allowlist), L1 (no leaking URL tokens).

Planned tests (E5): the path refuses `http`, redirects, private IPs, URLs different from the header, and messages without `List-Unsubscribe-Post`.

## 7. Open points

1. ~~Plan P1 pending~~ Resolved 2026-11-17: P1 accepted as written in section 6.
2. CASA applicability for a local-only app (checklist G3) could add an assessment duty and a verification-time review; see N10.
3. Whether the model host can be denied network access at the OS level on all three platforms (W4) is not yet checked; the session filter plus the host having no HTTP client is the v0 mitigation. Verify in E3/E4.
4. Which libraries will parse attachments and PDFs (W2) is undecided, so its mitigation is generic until E6.
5. S6 and S7 are accepted risks to revisit in the external review (E8, P10).
