# Mission brief: plan and organize **Pochimail**

You are the coordinator agent. You plan the work, set up the repository and GitHub tracking, and delegate implementation to sub-agents. You do not write most of the code yourself. The repository does not exist yet.

Your first run produces a plan and a backlog, not code. Stop for my review before any implementation starts (see section 10).

> **Name (decided):** the app is **Pochimail**, the mascot and assistant is **Pochi** (from *pochi-bukuro* ポチ袋, the small decorative Japanese envelope). Website: **getpochimail.com**. Repository: **`pochimail/pochimail`** (moved to the `pochimail` GitHub org on 2026-11-18; GitHub keeps redirects, issues, stars and releases on transfer, so never hard-code the owner: read it from one config value, e.g. `repository` in package.json and the updater's `publish` config). npm scope `@pochimail` is for internal workspace package names only; nothing is published to npm in v1. The app is "Pochimail" in product copy; the assistant speaks as "Pochi" ("Hi, I'm Pochi").

---

## 1. Product vision

Pochimail is an open-source, privacy-first **desktop assistant** that gives people an overview of their mailboxes and helps them clean them up. It works on one or several existing accounts of any provider: Gmail, Outlook/Microsoft 365, Yahoo, iCloud and any IMAP mailbox (decided 2026-11-17).

**Pochimail is not a mail client.** It never becomes the place where people read or write mail. It sorts, summarizes, cleans and rescues; any individual mail opens in the user's usual mail app (Gmail web, Outlook, Apple Mail).

- People have several accounts with years of mail: conversations, documents, receipts, notifications, newsletters, promotions, spam.
- Pochimail analyzes everything **on the user's device**, shows the big picture, flags what matters, proposes cleanups and builds a **documents library**.
- **Target user: non-technical people.** No setup, no jargon. Say "your mail stays on this computer", not "local inference".
- Quality bar: open source, with UI/UX on par with the best consumer Mac apps. Modern, calm, never gimmicky.

### The assistant
The assistant is **Pochi**, a character: a soft plush envelope that speaks in the first person ("Here's what I found", "I haven't changed anything yet"). It guides onboarding, reports progress and summarizes results. Its tone is calm, helpful and brief.

### Core principles (non-negotiable)
1. **Local-first.** Mail data, AI analysis and the vault stay on the device. No backend server, no telemetry by default.
2. **The assistant proposes, the user decides** (unless the user chose Autopilot, within strict limits).
3. **Safe by default.** Never delete. Archive instead. Never touch mail from real people (People category) without explicit approval. Preview before every batch. Full action log. Undo everything.
4. **Never block the user.** All heavy work runs in the background with live progress; the user can keep browsing.
5. **Privacy is the first message** in every screen where data is processed.

---

## 2. What the assistant does: capabilities × autonomy

Onboarding asks two questions. Both can be changed anytime in Settings.

### Question 1: "What should I help with?" (multi-select, all on by default)
| Capability | Covers |
|---|---|
| **Catch what matters** | People waiting on you, threads waiting on others, deadlines, important senders. Digest of what needs attention. |
| **Declutter** | Unsubscribe (newsletters, promotions), archive old notifications, codes and shipping updates. |
| **Organize** | Apply categories and topics as real labels (Gmail labels, Outlook categories). |
| **Save documents** | Detect important documents and save/export them. |

### Question 2: "How much can I do?" (single choice)
| Mode | Behavior |
|---|---|
| **Just look** | Read-only. Shows insights and exports attachments; never changes the mailbox. |
| **Suggest** (default) | Prepares suggestions; acts only when the user confirms. |
| **Autopilot** | Applies only high-confidence, low-risk actions on its own (unsubscribe from never-opened senders, archive old promos/notifications/codes), then sends a summary with undo. Never deletes, never acts on People, never acts below a confidence threshold. |

Invariants in every mode: no deletion, People untouched without approval, every action logged and undoable.

---

## 3. Mail model: categories, topics, signals

Every message gets exactly **one category**, any number of **topics**, and computed **signals**.

### Categories (mutually exclusive, cover everything)
| Category | Examples | Default behavior |
|---|---|---|
| **People** | Real conversations, personal and work | Always kept, never automated |
| **Records** | Bank, taxes, insurance, health, contracts, housing, school | Kept; attachments saved |
| **Purchases & travel** | Receipts, orders, shipping, bookings, tickets | Receipts kept; shipping updates archived after delivery |
| **Sign-ins & security** | Sign-in codes, password resets, login alerts | Archived after ~30 days |
| **Notifications** | Social, apps, tools, calendars, comments | Archived after a configurable age |
| **Newsletters** | Subscribed content | Unsubscribe suggested if never opened |
| **Promotions** | Sales, marketing | Unsubscribe or archive |

**Suspicious** (phishing) is a flag on top of any category, not a category.

**Display rule (decided 2026-11-17):** the 7 categories are a fixed classification set, but the sidebar, the Overview and the account filters only show categories that contain emails for the current account selection. Empty categories are hidden; the "empty category" state only appears when the category the user is viewing becomes empty (e.g. after a cleanup).

### Topics (optional, multi-label, user-editable)
Life areas such as Job search, Work, Finance, Home, Health, Travel, Family, Projects. Pochimail suggests 5–8 based on the mailbox; the user can rename, merge, add or remove. A topic can span categories (a recruiter's mail in People and a job-board notification in Notifications both get *Job search*).

### Signals (computed, never managed by hand)
Needs a reply · Waiting on them · Important sender (frequently replied to, or marked VIP) · Has a document (invoice, contract, ID, payslip…) · Time-sensitive (deadline, event, expiry) · Old and never opened.

### The assistant's brain: three layers, cheapest first
1. **Rules (deterministic, instant):** headers (`List-Unsubscribe`, `Precedence: bulk`), known sender domains, the user's own reply history, sender-level aggregation. Covers the bulk of the mailbox.
2. **Decision layer (fast, typed, with probabilities):** category, "unsubscribe yes/no", importance score, "needs reply" for each sender or thread. Output is a choice from a fixed set plus a calibrated confidence. Confidence thresholds drive Autopilot (act only above a high threshold) and send unsure cases to the next layer or to the user. Implementation: local embeddings + calibrated classification heads (see below).
3. **Generative LLM (slower, smart):** what needs language or open-ended understanding: discovering and naming topics, extracting deadlines and dates, explaining a suggestion ("weekly promo, you never opened it"), writing digests and the summary, and the assistant's voice. Implementation: the bundled local LLM.

All model output is validated with zod. Every decision stores its reason and confidence so the UI can explain it.

### Local AI only (decided)
Pochimail runs **only local models**. No cloud providers, no API keys, no "bring your own model" in v1. Inference never touches the network. The goal is to make local AI excellent, not optional.

**Runtimes** (verify current versions and benchmarks in a research issue, record the choice in an ADR):
- Generative layer: llama.cpp through `node-llama-cpp` (GGUF models, Metal on Apple Silicon, CUDA/Vulkan elsewhere), running in its own utility process.
- Embeddings and decision heads: ONNX Runtime (`onnxruntime-node`) or Transformers.js, also off the UI path.

**Models**:
- A small instruction model (roughly 1–4B parameters, 4-bit quantized) for the generative layer, and a small embedding model. Pick the current best open models at build time; licenses must allow redistribution.
- **Multilingual is a hard requirement** (at least English, French and Japanese in the eval set).
- **Hardware tiers**: detect RAM/GPU at first launch and choose the model size accordingly; on weak machines, run rules + decision layer only and say so in plain language.
- Models are downloaded on first launch (resumable, SHA-256 verified, progress UI), stored locally, updated with the app.

**Making it accurate**:
- Decision layer = embeddings + lightweight classification heads trained on a labeled dataset, with **calibrated probabilities** (temperature/Platt scaling). Ship the trained heads with the app.
- **Learns from the user, on device**: every correction ("this isn't a newsletter", "this sender is important") becomes a labeled example; use nearest-neighbor lookup over the user's examples plus periodic local re-fitting of the heads. Never sent anywhere.
- Generative calls use **grammar-constrained / JSON-schema decoding** so output always parses, then zod validation.
- Short, versioned prompts with few-shot examples, kept in the repo and covered by the eval set.

**Making it fast**:
- Decide **per sender and per template**, not per message: newsletters and notifications reuse templates, so cluster by normalized subject/body template hash and classify each cluster once.
- Feed models the minimum: headers, sender stats and a trimmed snippet first; full bodies only when a signal needs them (deadlines, documents), fetched on demand and processed in memory only.
- Cache every result by content hash; never re-run a model on unchanged input.
- Batch inference, bounded concurrency, and **power awareness**: heavy jobs run when plugged in or idle (Electron `powerMonitor`), throttle on battery and high thermal pressure, pause on sleep.
- Latency budgets in CI (e.g. emails per minute per hardware tier) next to the accuracy metrics.

Keep an evaluation set (fixture mailbox) with precision/recall per category and per signal, tracked in CI.

---

## 4. Scope

### v1 (desktop, macOS first, then Windows/Linux)
- Onboarding flow (section 7): welcome → connect → setup → background sorting → summary.
- **Multiple accounts, any provider**: Gmail (Gmail API) and Microsoft (Graph) via OAuth (PKCE, tokens in the OS keychain), plus a generic **IMAP connector** with presets (Yahoo, iCloud, Fastmail, GMX…): OAuth (XOAUTH2) where the provider allows it, otherwise an app password stored in the keychain. Unified "All accounts" view plus per-account filters.
- **Overview** home: "Catch what matters" at the top, then a "Clean up" card per category with count, size and one primary action.
- Category, topic and focus views (lists of senders/threads with actions; individual emails open in the user's mail app).
- Unsubscribe via RFC 8058 one-click (`List-Unsubscribe-Post`) or `mailto:` only. **Never** follow links in the email body.
- Archive, label/categorize, mark as handled; all batchable; all undoable.
- **Documents**: real documents only (filter signature logos, inline images, tracking pixels; dedupe by SHA-256). Filter by type, export to a folder with clean naming (`2024/Invoices/Amazon_2024-03.pdf`).
- **Summary report** after each scan (section 7).
- **Keep it tidy**: continuous mode (section 5.5) with notifications and digests.
- **Activity & undo** screen.
- Local AI only (section 3): bundled models downloaded on first launch, hardware-tier selection, on-device learning from corrections, graceful fallback on weak machines.
- Light and dark mode, keyboard shortcuts, full accessibility (WCAG AA contrast, focus states, screen-reader labels).

### Explicitly out of scope for v1
Reading or composing mail, deleting mail, mobile app, any cloud AI or third-party model provider, Teams.

### Later
- **v1.x:** optional notification relay, rclone export to any drive, custom rules.
- **v2:** natural-language search across mail and attachments (local embeddings, OCR), mobile companion app (Expo) for triage and the vault, encrypted device sync through the user's own drive.
- **Teams (planned, not built in v1):** shared workspaces, handover when someone leaves (export a departing member's important files and threads with a summary report). In v1: a **disabled "Teams · Soon" item** in the sidebar, and a data model that won't need a rewrite (see 5.6).

---

## 5. Architecture

### 5.1 Monorepo (inspired by Midday)
Use **Midday** (github.com/midday-ai/midday) as the main reference for structure and conventions; study its current repo before finalizing. Also look at create-t3-turbo (tooling, `packages/ui` with shadcn) and AFFiNE (desktop + mobile sharing one core). Record the final layout in an ADR.

```
apps/
  desktop/          Electron: src/main, src/preload, src/worker, src/renderer
  mobile/           (later) Expo
  cli/              dev-only pipeline CLI on fixtures (private, never shipped; M1 "CLI running the full pipeline"; ADR 0001)
packages/
  core/             domain entities, events, ports, use cases. Pure TS, no Node/DOM/Electron APIs
  db/               SQLite schema, migrations, repositories, outbox/job tables
  mail/             providers: gmail, microsoft-graph, imap (generic + provider presets)
  ai/               classification pipeline, model providers (bundled local model first)
  ui/               shadcn/ui components + design tokens (set up with the shadcn CLI monorepo mode)
  testing/          in-memory port implementations, fixture mailboxes (.mbox), eval harness
tooling/            shared typescript / biome configs (or Midday's equivalent)
docs/               brief.md, product.md, design.md, mascot.md, plan.md, adr/, design/ (screen references), security/
```

Turborepo + pnpm (or Bun if following Midday; decide in an ADR). `exports` in every package.json, no barrel files, no cross-package `../` imports, no root tsconfig.

### 5.2 Hexagonal core
- `core` defines ports: `MailProvider`, `MessageRepository`, `BlobStore`, `SecretStore`, `LlmProvider`, `Exporter`, `JobQueue`, `EventBus`, `Scheduler`, `Notifier`, `Clock`, `Logger`.
- Entities: Account, Message (headers + metadata), Thread, Sender (aggregated stats), Attachment, Category, Topic, Signal, Suggestion (action + reason + confidence), Action (command + inverse), ActionLog.
- Central flow: **Suggestion → Approval (or Autopilot policy) → Action → ActionLog (with inverse for undo)**.
- One composition root per app wires the implementations.

### 5.3 Event-driven, async processing
The app must feel instant on mailboxes with 100k+ messages. Use these patterns where they fit:

- **Typed domain events** on an in-process event bus: `AccountConnected`, `SyncBatchFetched`, `MessagesUpserted`, `MessageClassified`, `SignalDetected`, `SuggestionCreated`, `SuggestionApproved`, `ActionApplied`, `ActionFailed`, `ActionUndone`, `AttachmentSaved`, `ScanProgressed`, `ScanCompleted`, `DigestReady`.
- **Transactional outbox + persistent job queue in SQLite**: domain writes and the events/jobs they produce commit in one transaction; workers consume jobs. Jobs survive restarts and resume (sync cursors, classification batches, exports).
- **Pipeline as staged async workers**: sync → parse → classify → detect signals → build suggestions. Each stage consumes events from the previous one, processes in **batches**, with **bounded concurrency**, **backpressure** and **AbortController** cancellation (pause/resume from the UI).
- **CPU-heavy work** (parsing, hashing, model inference) runs off the main worker thread (worker threads / a dedicated utility process for the model).
- **Incremental sync with real-time wake-ups, no server**:
  - Data always comes from the official delta APIs: Gmail `history.list` with stored history IDs, Microsoft Graph delta queries with delta tokens (IMAP `CONDSTORE/QRESYNC` for IMAP accounts, with a UID-range fallback when the server lacks them). Headers first; bodies and attachments are fetched on demand, processed in memory and never persisted (D11).
  - **Wake-up signal: IMAP `IDLE`** over OAuth (XOAUTH2), a standard persistent connection from the device to the provider. It only tells the app "something changed"; the app then runs a delta sync. Re-issue IDLE before the server timeout (~29 min), reconnect with backoff, and pause on sleep/offline. Check whether the IMAP OAuth scope is acceptable for Google verification and whether M365 tenants have IMAP disabled; fall back gracefully.
  - **Fallback: adaptive polling** of the delta APIs (frequent while the app is active, slower in the background), used when IDLE isn't available.
  - **Optional later (v1.x): a privacy-preserving relay** for Gmail Pub/Sub and Graph change notifications. Open source and self-hostable; it receives only "account changed" pings (no mail content, hashed account IDs) and forwards them to the app over an authenticated WebSocket. Off by default.
  - Record this strategy in an ADR.
- **Provider efficiency**: batch endpoints (Gmail batch modify, Graph `$batch`), rate-limit handling with exponential backoff + jitter, per-account quotas.
- **Idempotent, reversible actions** (Command pattern): each action has an idempotency key and an inverse stored in the ActionLog, so retries are safe and undo works across restarts.
- **Live UI updates**: the worker streams progress and domain events to the renderer over typed IPC subscriptions (tRPC subscriptions over Electron IPC or MessagePorts). The renderer updates TanStack Query caches from events instead of polling. Optimistic updates for user actions, reconciled on `ActionApplied`/`ActionFailed`.
- **Storage performance**: SQLite in WAL mode, proper indexes, FTS5 over metadata and derived data (never bodies), aggregated sender stats maintained incrementally, content-addressed blob store only for documents the user saved.

### 5.4 Electron process model
- `main`: windows, lifecycle, tray/menu-bar icon, login item (for Keep it tidy), native notifications, OS integration.
- `worker`: `utilityProcess` running core + adapters + job workers.
- `renderer`: React 19 SPA built with **Vite** (via `electron-vite`), routed with **TanStack Router** (type-safe, pairs with TanStack Query). No Next.js and no React Server Components: there is no server, and the React docs explicitly cover building from a build tool when a framework doesn't fit. Enable the **React Compiler** (automatic memoization) and keep **TanStack** as the app's data layer: Router (navigation), Query (worker data), Virtual (long lists), Table (headless tables for the Documents and review lists). It talks to the worker through the typed IPC contract (zod schemas shared by both sides).
- Electron security checklist: `contextIsolation`, sandbox, no `nodeIntegration`, a narrow preload API via `contextBridge`, strict CSP.
- Pochimail shows previews/snippets only. Any HTML rendering of mail content is untrusted: sandboxed iframe, strict CSP, remote images blocked by default, never in a context that can reach the preload API.

### 5.5 Keep it tidy, scheduling and notifications
- User-chosen cadence: **As it arrives** (on each delta sync), **Once a day**, **Once a week**, **Only when I ask**.
- Toggles: label new mail, save new documents, suggest unsubscribes, weekly summary.
- A `Scheduler` port (implemented in the worker) triggers incremental scans; the app can keep running in the menu bar/tray, with an optional login item.
- **Notifications**: native OS notifications for scan completed, digest ready ("3 people are waiting on you, 1 deadline Friday") and Autopilot summaries; an in-app notification center; quiet hours; grouped/coalesced so they never spam. **Privacy by default:** notifications show counts, not subjects or sender names, unless the user opts in.

### 5.6 Ready for Teams later (do not build)
- Put a `workspaceId` on accounts and every domain entity from day one; single implicit personal workspace in v1.
- Keep authorization decisions behind a policy function, even if v1 always allows.
- Sidebar shows a disabled "Teams · Soon" entry. No backend, no sync, no team logic in v1.


### 5.7 Always up to date
- **App updates**: `electron-updater` with **GitHub Releases** as the update source (free, fits open source). Builds are **signed and notarized** (Apple Developer ID; Windows code signing), with differential downloads (blockmaps).
- Check on launch and every few hours; download in the background; show "A new version is ready · Restart now / What's new" (see the update state), never interrupt a running cleanup, install on next quit otherwise. Release notes come from Changesets.
- Channels: **stable** and **beta** (opt-in in Settings); staged rollouts for stable.
- **Model and classifier updates** ship separately from app updates: a signed, versioned model manifest (SHA-256 per file) lets Pochimail fetch improved models or decision heads without a full app release. Downloads are resumable and verified; the user's on-device learning is preserved across updates.
- **Privacy**: update checks only contact GitHub Releases (and the model manifest location); no identifiers sent; users can turn automatic downloads off.
- **Dependencies stay current**: Renovate (grouped, weekly) plus security alerts; Electron kept within its supported versions.

### 5.8 Languages and binaries
- **TypeScript only.** No Rust in v1: Electron runs the TypeScript core natively, and the heavy lifting already happens in native code we don't write (llama.cpp, ONNX Runtime, SQLite). If profiling ever shows a hot path, add a small native module with napi-rs later, behind a port.
- **Native modules** (`node-llama-cpp`, `better-sqlite3` or the chosen SQLite driver, `onnxruntime-node`) are rebuilt per OS and CPU architecture by `electron-builder`; CI produces each binary on its own runner.
- **Expected download size**: roughly 100–150 MB per platform for the app; AI models are **not bundled** and download on first launch (with progress, resumable, checksummed), sized to the machine.
- **Artifacts per release**: macOS universal `.dmg` + `.zip` (signed, notarized, used by auto-update), Windows `.exe` (NSIS) and/or `.msix` (signed), Linux `.AppImage`, `.deb`, `.rpm`. Published on GitHub Releases with checksums; getpochimail.com links to them.

### 5.9 Cross-platform from day one (macOS first)
- Release order: **macOS first** (Apple Silicon + Intel, universal build), then **Windows**, then **Linux**. The code must build and run on all three from the start; CI runs the test suite and a packaging smoke build on macOS, Windows and Linux runners.
- Packaging with electron-builder: `dmg` + `zip` (macOS, signed and notarized), `nsis`/`msix` (Windows, signed), `AppImage` + `deb`/`rpm` (Linux).
- Everything platform-specific sits behind ports in `core` with one adapter per OS: secret storage (Electron `safeStorage` / OS keychain), menu bar (macOS) vs system tray (Windows/Linux), login item, notifications, file locations, power and thermal state, GPU acceleration for local models (Metal / CUDA / Vulkan / CPU fallback).
- **Device naming is dynamic**: copy never hard-codes "Mac". A `deviceName()` helper returns "Mac", "PC" or "computer" (Linux) and every string uses it ("Sorting privately on this {device}", "Your email never leaves this {device}"). The designs show the macOS wording because macOS ships first.
- Keyboard shortcuts use the platform modifier (⌘ on macOS, Ctrl elsewhere); window chrome follows each OS (traffic lights on macOS, native controls on Windows/Linux).

### 5.10 Security and privacy hardening
Pochimail handles people's entire mailbox; treat security as a feature with its own milestone tasks and a written threat model (`docs/security/threat-model.md`).
- **Data at rest is encrypted**: the SQLite database uses SQLCipher (or an equivalent encrypted SQLite build); the key lives in the OS keychain via Electron `safeStorage`. OAuth refresh tokens are stored only in the keychain, never in files or logs.
- **Least-privilege scopes**: request the narrowest Gmail/Graph scopes each capability needs (e.g. `gmail.modify`, never delete scopes). If IMAP IDLE requires a broader scope, make it an opt-in "real-time updates" setting, otherwise rely on delta polling.
- **Untrusted email content**: never execute or render remote content; previews are text or sanitized HTML in a sandboxed iframe with a strict CSP and remote images blocked. Never follow links in email bodies (unsubscribe only via RFC 8058 one-click or mailto). Attachments are hashed and stored only when the user saves them (D11), never opened automatically.
- **Electron hardening**: contextIsolation, sandbox, no nodeIntegration, narrow preload API, strict CSP, navigation and new-window blocking, `webSecurity` on, Electron Fuses set (disable RunAsNode, enable cookie encryption, ASAR integrity), keep Electron on a supported version.
- **No network except**: Google/Microsoft APIs, the IMAP/SMTP hosts of accounts the user connected, GitHub Releases (updates) and the model manifest. *(Pending plan P1: one exception, the RFC 8058 one-click unsubscribe POST to the exact `List-Unsubscribe` URL, through one dedicated logged path, no cookies, no redirects.)* Enforce with a session-level request filter that blocks everything else, and document every outbound host.
- **Supply chain**: pinned lockfile, minimal dependencies, Renovate with review, `osv-scanner`/`npm audit` in CI, npm provenance for published packages, SBOM attached to each release, reproducible builds where possible.
- **Signed everything**: code signing and notarization, signed update metadata, SHA-256 checks on model files.
- **Privacy by default**: no telemetry, no crash reporting unless the user opts in (and then scrubbed of all email content); logs redact addresses, subjects and bodies.
- **Before 1.0**: an external security review of the Electron app and the OAuth/token handling; `SECURITY.md` with a private disclosure address.

---

## 6. Design system

The folder starts with **instructions and design material only** (`docs/`, not committed yet); you build `apps/` and `packages/` yourself. During the initial setup (M0), **move** the code-bound material below into the code (no copies left in `docs/`), then delete the emptied folders. After that, `docs/design/` holds only references (screens, design-tool fonts, README) and the code is the source of truth for tokens, fonts, brand and mascot. I commit once the initial setup is done:
- `docs/product.md`, `docs/design.md`, `docs/mascot.md`: product context, design system (type, colors, components, motion catalog, writing, anti-patterns, states), Pochi's character, emotions and animation plan.
- `docs/design/screens/`: PNG of every screen and state (`light/`, `dark/`, `phone/`, `narrow-window/`), the visual reference for each issue; `html/` static HTML/CSS of each screen with mock data (exact spacing, colors, copy); `source/` original canvas files (motion keyframes and timing in `Motion.dc.html`). Reference only, never shipped.
- `docs/design/shadcn/` → move as-is to the matching paths: `packages/ui/` (`components.json`, `package.json` exports for `@pochimail/ui`, `tsconfig.json`, `src/lib/utils.ts` with `cn()`, `src/styles/globals.css` entry + `theme.css` fonts and Tailwind v4 `@theme`) and `apps/desktop/components.json` (components install into `packages/ui`). Then add components with the shadcn CLI from `apps/desktop`.
- `docs/design/tokens/` → `packages/ui/src/styles/` (`tokens.json` W3C Design Tokens as the source, `tokens.css` light/dark variables with shadcn naming).
- `docs/design/fonts/woff2/` + `OFL-*.txt` → `packages/ui/src/fonts/` (self-hosted; `theme.css` loads `../fonts/woff2/`). `fonts/ttf/` stays in `docs/design/` (design tools).
- `docs/design/brand/` → `apps/desktop/build/` for electron-builder (`icon.icns`, `icon.ico`, `icon-1024.png` as `icon.png`, the PNG set as `icons/NxN.png` for Linux), `apps/desktop/resources/tray/` (macOS template tray icon), `packages/ui/src/assets/brand/` (lockups, wordmarks, app icon SVG).
- `docs/design/mascot/` (placeholder PNGs per pose, @1x/@2x) → `packages/ui/src/assets/mascot/`, behind a `Mascot` component with a `pose` prop.
- Provider sign-in buttons use the official Google "G" and Microsoft logos, following each provider's sign-in branding guidelines.

### Style
Modern, calm, sober, with an editorial signature: content is laid out like a well-typeset document, with hairline rules, open space and typography instead of boxes. Cool neutral grey surfaces (the mascot is the only warm element), white surfaces only where content needs a container, charcoal primary buttons. Avoid the generic "dashboard of cards and stat tiles" look. Data uses ledgers (rows with proportional bars and dotted leaders), not tiles. Radius scale: 16px for cards and panels, 10–12px for buttons and inputs, full for pills. Screen titles are functional ("Overview", "Newsletters"), never greetings. Color is used sparingly: category dots, small tints, the mascot. Not a dark "hacker" UI, not a colorful gradient UI.

### Typography
- **Newsreader** (Google Fonts, open license), upright, weight ~450, tight tracking, for screen titles, big figures and Pochi's summaries. It gives Pochimail an editorial, "written by someone" voice.
- **Instrument Sans** for all interface text (400/500/600). Tabular numbers for counts.
- Never italic display serif. Never more than these two families.

### Color tokens (light mode)
| Token | Value |
|---|---|
| background | `#F3F4F5` |
| surface / card | `#FFFFFF` |
| border | `#E3E5E8` |
| muted surface | `#EDEFF1` |
| text primary | `#15171A` |
| text secondary | `#5C6169` |
| text tertiary | `#686D75` |
| primary (buttons) | `#15171A` with `#FFFFFF` text |

Category colors are reserved for rare data visualizations (e.g. a future breakdown chart); screens use monochrome category icons in the sidebar and no color coding in content. Values for reference (never body text): People `#4E6A8A` · Records `#8A6A4E` · Purchases & travel `#B07820` · Sign-ins & security `#7C7F86` · Notifications `#5A817B` · Newsletters `#C04F72` · Promotions `#9C6E95`. Dark variants are in `tokens/`.

**Dark mode** is defined in `packages/ui/src/styles/tokens.css` (`.dark`, moved from `docs/design/tokens/`): background `#121315`, surface `#1A1C1F`, text `#EEF0F2`, secondary `#A4A9B0`, tertiary `#8C9199`, primary button `#EEF0F2` with `#121315` text. All pairs pass WCAG AA; keep an automated contrast check in Storybook/CI.

Use the provided token files as-is in `packages/ui`; never hard-code colors in components.

### Mascot
- A soft **plush felt envelope**: puffy rounded body, fuzzy fabric texture, a stitched seam where the flap folds, two small glossy black pill-shaped bead eyes, no mouth. Style reference: the current wave of plush 3D brand mascots (soft fur, studio lighting, minimal faces).
- Colorways: **cream** (main), charcoal with white bead eyes (dark mode, app icon), stone, muted sage.
- Expressions/poses: default, happy (closed eyes), reading with round glasses (vault/sorting), paperclip on top (saving a file).
- Final assets are **3D renders** (PNG/WebP, transparent background, multiple sizes) produced outside the codebase. Until they exist, use placeholder images and a `Mascot` component with a `pose` prop so swapping in renders is trivial. Animate it with **Rive** (state machine driven by domain events: idle breathing and blinks, eyes following the cursor, sorting with glasses, found/happy reactions, sleepy when paused, oops on errors), built from the 3D renders as layers; static PNG fallback; plays only when visible; static under `prefers-reduced-motion`. Details in `docs/mascot.md`.


### Interaction and accessibility rules
- Every interactive element is a real `button`, `a`, `input`, switch (`role="switch"`), checkbox or radio, reachable by keyboard, with visible `focus-visible` states. Minimum target 32px (36px for sidebar items, 44px for primary buttons).
- Every section title is a real heading (`h1` once per screen, then `h2`); lists are lists; live progress uses `role="status"` with `aria-live="polite"`.
- Text contrast ≥ 4.5:1 everywhere (tertiary text included). Never rely on color alone; patterns (e.g. hatching) and labels carry meaning.
- Copy fits translations (French/Japanese expand text): short action labels ("Unsubscribe 120", "Archive 12,940"), no fixed-width text that can clip; ellipsis plus a tooltip for long names.
- Motion: 150ms for hover/press feedback, 200–250ms for panels and toasts, one easing (`cubic-bezier(0.22, 1, 0.36, 1)`); pressed buttons scale to 0.98. Implement the motion catalog in `docs/design.md` (live progress, numbers rolling up, ledger bars cascading, rows folding away with an undo toast, the letter rising with its stamp, step transitions with the mascot staying in place). Use CSS transitions and the Motion library (`motion/react`) for layout/presence animations. No looping or pulsing animations except the mascot's idle breathing; everything respects `prefers-reduced-motion`.
- Wording: say "email/emails" (never "mails"), "Pochi" or "I" for the assistant, "Review" for opening a list, "Undo" for reversing. Screen titles are functional ("Overview", "Newsletters"), never greetings.

### Responsive layout
The desktop window is resizable (minimum 720×560), and the same UI will feed the mobile companion later:
- **≥ 960px**: full sidebar.
- **760–960px**: sidebar collapses to an icon rail (Overview, Documents, Activity, Settings, account switcher); categories and topics stay reachable from the Overview ledger.
- **< 760px**: the window frame goes edge to edge; the ledger drops the proportional bar; secondary hints hide.
- **< 560px (phone / companion)**: top bar with the app name and account switcher, bottom tab bar (Overview, Documents, Activity, Settings), single-column content, onboarding cards stack, the summary becomes a bottom sheet.
Implement with container-aware layout (CSS grid/flex + Tailwind breakpoints), never with separate mobile markup.

### Anti-patterns to avoid (Impeccable checklist)
No cards inside cards, no icon-tile stacks, no numbered section labels (01/02/03, "1 ·"), no eyebrow chips above headings, no thin borders combined with wide shadows, no beige "AI" palettes, no pulsing dots, no generic loading spinners (use skeletons and real progress), no gradients, no emoji. Run the Impeccable detector (`/impeccable audit`) in CI or before each UI PR if available.

### Required states
Design and build these with the mascot and plain-language copy: sign-in cancelled, offline (paused, resumes automatically), account needs reconnecting, model download failed (fall back to rules), provider rate limit (auto-resume with time estimate), empty category, nothing to do. Every state has one primary action.

### States and motion are features, not polish
The empty/error/update states and the motion catalog are part of the product and must be built and tested like any feature, each with its own issue and acceptance criteria:
- **States** (`docs/design/screens/*/06-states.png`): sign-in cancelled, offline (status line, never a pop-up), account needs reconnecting, model download failed (rules fallback), provider rate limit (auto-resume with time), empty category, update ready. Each uses the mascot pose, the exact copy and one primary action.
- **Motion** (docs/design.md › Motion catalog and the motion board): live progress line and status text, counts rolling up, ledger bars cascading, rows folding away with the undo toast, Pochi's idle breathing and "found" reaction, the summary sheet rising with its stamp, checkboxes drawing and switches gliding, step transitions with Pochi staying in place.
- Provide a dev-only gallery route (or Storybook stories) showing every state and motion so they can be reviewed and tested in isolation; Playwright visual tests cover each state in light and dark.

### Mock data for development
Use one realistic mock dataset everywhere (fixtures, Storybook, screenshots), matching the reference screens: 2 accounts (Gmail personal, Outlook work), 48,312 emails over 9 years, 6.4 GB used, 3.1 GB freeable, 412 documents; categories People 6,820 · Records 2,104 · Purchases & travel 3,580 · Sign-ins & security 1,962 · Notifications 14,230 · Newsletters 10,410 · Promotions 9,206; 7 people waiting (oldest 9 days), 3 deadlines this week, 12 new from important people. Never ship placeholder tokens like "[X]" in UI.

### Voice
First person, short, warm, plain language. Always reassure about privacy and reversibility where data is processed or changed.

---

## 7. Key screens and UX

1. **Welcome**: mascot, "Clean up your email. Keep what matters.", "Pochimail is a private assistant for the email accounts you already have… Your email never leaves this Mac." One button. "Free and open source". Step indicator (3 steps) only on onboarding screens.
2. **Connect**: Google / Microsoft buttons plus "Other email provider" (Yahoo, iCloud, any IMAP account; needs a design issue: provider picker + app-password form), "you can add more accounts later". Next to it, "My promises" as a plain list: your email stays on this Mac, you decide what I can do, nothing is ever deleted.
3. **Setup**: mascot speech bubble, then the two questions from section 2 as plain headings, no numbering (capabilities as checkboxes with Catch what matters first; autonomy as radios with Suggest recommended), a one-line reminder of the invariants, and a "Start sorting" button.
4. **Overview (home), usable while sorting**: the user lands in the app immediately. Sidebar: account switcher (All accounts / per account / add another), Overview, the 7 categories with counts, Topics, Tools (Documents, Activity & undo, Settings), disabled Teams · Soon. Main, in this order: a 2px progress line with one status line underneath ("Sorting privately on this Mac", percentage, latest action, Pause/Resume, View summary); a serif "Overview" title; **Catch what matters** as three lines led by large serif numbers (people waiting on you, deadlines, important people; "I never clean these"; each with Review); **Clean up** modeled on the macOS Storage recommendations pattern: a serif headline figure ("3.1 GB you can free, out of 6.4 GB"), one monochrome storage bar (solid = worth keeping, hatched = can be cleaned) with a two-item legend, then a list of recommendations ordered by impact, each a plain sentence ("Unsubscribe from 120 newsletters"), a one-line reason, the space it frees and a single "Review" button; a closing line says people, records and receipts are never cleaned. Nothing runs from this screen: Review opens the detail with checkboxes and the final confirm. No per-category colors in content. Numbers update live from events.
5. **Summary: a sheet over the Overview, not a separate page.** When the first scan finishes (and from "View summary"), a modal sheet slides down over the Overview; the sidebar and the Overview stay visible behind a dim scrim, so the user never loses their place. It shows only what is new, never a copy of the Overview: header with the mascot postage stamp (the brand signature), "From Pochi · date · on this Mac" and a close button; serif title "Your mailbox, sorted." and one sentence (emails sorted, accounts, nothing changed yet); three figures (GB you can free, documents saved, people waiting); a "Where I'd start" box with one primary action ("Show the 7 people") and "Later"; "Keep it tidy" cadence as pill choices with "Change this anytime in Settings". Closing (×, Later, Esc) returns to the Overview, which already holds categories and clean-up recommendations. On phones it is a bottom sheet. Weekly and Autopilot summaries reuse the same sheet (Autopilot adds what was done + Undo).

### 7b. Full screen inventory and flows
Designed so far (reference screens): Welcome, Connect, Set up, Overview (usable while sorting), Summary sheet, empty/error/update states, mascot sheet, motion catalog, dark mode. Still to design before building them (create design issues for each):
- **Review screens**: Catch what matters list (people waiting, deadlines, important), category detail (senders grouped, with batch actions), unsubscribe review, topic view.
- **Documents** library (filters by type, export).
- **Activity & undo** (timeline of actions, undo per action or per batch).
- **Settings**: Accounts, Assistant (capabilities + autonomy), Keep it tidy, Notifications, Privacy & data (local storage location, delete all data), Models (status, re-download), Updates (channel), About.
- **Autopilot summary** (same summary sheet, with what was done and Undo) and the macOS menu-bar popover.

**Account flow**
- Connect: OAuth in the system browser with PKCE and a loopback redirect; the app returns to the Set up step on success, or shows the "sign-in cancelled" state.
- Add another account: from the account switcher; skips Set up (settings are global), starts a background sort for that account only.
- Per-account view: the switcher filters every screen; "All accounts" is the default.
- Reconnect: when a token expires, a quiet banner on that account ("Gmail needs you to sign in again") and the "reconnect" state; nothing else stops.
- Remove account: confirms, revokes the token, deletes that account's local data (index, labels history, saved-document references); saved files on disk are kept unless the user also chooses to delete them.
- Reset Pochimail: Settings › Privacy & data deletes everything local and returns to Welcome.

**Lifecycle**
First launch → Welcome → Connect → Set up → Overview while sorting (rules start immediately; the local model downloads in parallel and refines results when ready) → Summary sheet over the Overview → everyday loop: a notification, the menu bar or opening the app → Overview → Review → act → Undo if needed. Closing the window keeps Pochimail in the menu bar only if Keep it tidy is on; otherwise it quits.

**Offline behavior (never disruptive)**
Everything Pochimail knows is stored locally, so offline is a normal state, not an error:
- Overview, categories, Documents, Activity and the summary stay fully usable with the last synced data, marked "Updated [time]".
- Full message text is not stored (D11): reading a mail in full needs the mail app (and a connection).
- Sync and model downloads pause and resume on their own when the connection returns.
- Actions the user approves while offline (archive, labels, unsubscribe) are queued, shown as "Will apply when you're back online", applied automatically on reconnect, and undoable as usual.
- The only signal is the status line ("Offline · I'll continue when you're back"); no modal, no repeated notification.

### 7c. Settings (designed: `docs/design/screens/*/07-settings.png`)
One scrolling page of grouped lists (macOS System Settings pattern), applying to all accounts:
- **Accounts**: each account with provider logo, address, status ("synced 2 minutes ago" / "needs you to sign in again"), Reconnect, Remove (confirm; revokes access and deletes that account's local data), + Add an account.
- **Pochi**: autonomy (Just look / Suggest / Autopilot) and the four capabilities as switches.
- **Keep it tidy**: cadence (segmented control: As it arrives / Daily / Weekly / Off, same values as the full labels As it arrives · Once a day · Once a week · Only when I ask; "Off" is the short label for "Only when I ask"), run in the menu bar, open at login.
- **Notifications**: weekly summary, sorting finished, Autopilot reports, show names and subjects (off by default), quiet hours.
- **Appearance**: theme (System / Light / Dark), Animations (off = static poses and instant transitions), Show Pochi (off = no mascot anywhere). System "reduce motion" always wins.
- **Privacy & data**: local storage size + Show in Finder, documents folder (change), export my data, delete all local data (confirm; mailboxes untouched).
- **Updates**: current version + Check now, automatic downloads, channel (Stable / Beta).
- **About**: open source link (GitHub), privacy statement, website.
Pochi's pose and words follow the app's state everywhere, as mapped in `docs/mascot.md` › "Pochi's emotions".

Everywhere: no dead ends, empty states written by the mascot, skeletons instead of spinners, optimistic actions with undo toasts, keyboard shortcuts for power users.

---

## 8. Code quality standards

Write these into `CONTRIBUTING.md` and `AGENTS.md` (with `CLAUDE.md` pointing to it) so every sub-agent follows them.

### Tooling (enforced in CI)
- **Biome** for lint + format, **manypkg** for consistent versions (as in Midday).
- **TypeScript strict** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No `any`.
- **knip** for dead code, **Renovate** for updates.
- **Vitest** (unit/integration), **Playwright** (Electron E2E), **Storybook** for `packages/ui` with accessibility and contrast checks.
- CI gate on every PR: typecheck, lint, test, build, knip, eval-regression check. Nothing merges red.

### Frontend
- `packages/ui` follows current shadcn conventions: React 19 function components (no `forwardRef`), `data-slot`, CVA variants, `cn()` (className into `cn()`, not variants), exported `VariantProps`, `asChild` via Slot, `focus-visible` states. Wrap primitives, don't fork them.
- Vercel React composition patterns: no boolean-prop proliferation; compound components with shared context; explicit variant components; children over render props.
- Renderer layout: `features/<name>/` (smart components + hooks), `components/` (compositions of `@scope/ui`).
- State: worker data in TanStack Query (updated from IPC events); filters/selection in the URL/router; minimal global UI state.
- Virtualize every large list (TanStack Virtual). Forms: react-hook-form + zod.

### Backend (core + worker)
- Explicit use cases (`ConnectAccount`, `RunIncrementalSync`, `ClassifyBatch`, `DetectSignals`, `ProposeSuggestions`, `ApplyAction`, `UndoAction`, `ExportAttachments`, `BuildDigest`) with dependencies injected via ports.
- zod at every boundary: IPC, provider responses, LLM output.
- Typed errors: expected failures are `Result` values; exceptions only for bugs.
- Branded IDs (`MessageId`, `AccountId`, `WorkspaceId`).
- Privacy in logs: structured logger with redaction. Never log subjects, bodies, addresses or attachment names.

### Testing
- `core` fully unit-tested with in-memory adapters; event flows tested end to end in memory.
- Adapters tested against recorded API fixtures.
- Fixture mailbox doubles as the classification eval set.
- Playwright smoke tests for onboarding, background sorting, an action + undo.

### Open-source hygiene
- License: **AGPL-3.0** (decided 2026-11-17).
- **Keep the process light until v1** (solo maintainer + agents): Conventional Commits; README with the privacy promise and a short threat model; `LICENSE`; `SECURITY.md` (private vulnerability reporting); a short `CONTRIBUTING.md` (setup, own OAuth client IDs, commit style); ADRs. Add `CODE_OF_CONDUCT.md`, issue/PR templates, Changesets or release-please and a Project board only when outside contributors or regular releases arrive.

---

## 9. Known risks
- **Google OAuth verification** (restricted Gmail scopes) and Microsoft publisher verification: plan them as explicit milestones; use test users until verified. Check the current rules, including whether a local-only app avoids the paid CASA assessment.
- **Real-time without a server**: IMAP IDLE wake-ups may be unavailable (scope approval, disabled IMAP); adaptive polling must be a solid fallback (see 5.3).
- **Scale**: first sync of 100k+ messages takes time; background jobs, partial results and resumability are mandatory.
- **Local model quality vs. machine power**: hardware tiers, per-sender/template classification, caching and on-device learning are what make local AI good enough; benchmark accuracy and speed per tier in CI.
- **Trust**: one bad batch action ruins the product. Previews, no deletion, undo, conservative Autopilot thresholds.

Verify current versions and docs (Electron, Turborepo, shadcn CLI, the SQLite layer, the local LLM runtime, Gmail/Graph quotas and OAuth policies) instead of relying on memory. Record significant choices as ADRs.

---

## 9b. Open source, brand and distribution
- **Code license**: **AGPL-3.0** (decided 2026-11-17): forks that redistribute or host must stay open.
- **Brand is separate from code**: "Pochimail", "Pochi", the logo, the app icon and the mascot artwork are trademarks/creative works of the project, not covered by the code license. Add `TRADEMARKS.md`: anyone can use and fork the code, but redistributed or modified builds must use a different name and icon. Put mascot/brand assets under a non-commercial, no-derivatives license (e.g. CC BY-NC-ND 4.0) in a `LICENSE` file inside each brand folder (`packages/ui/src/assets/brand/`, `packages/ui/src/assets/mascot/`, `apps/desktop/build/`).
- **Official builds** are the signed ones published on GitHub Releases and linked from getpochimail.com. Only official builds use the project's Google/Microsoft OAuth client IDs (verified apps); forks and local dev builds must register their own client IDs (documented in `CONTRIBUTING.md`, read from env/config, never hard-coded).
- **Contributions**: no CLA. Before v1 no DCO bot or extra gates; when outside contributors arrive, require DCO sign-off (`git commit -s`).
- **Sustainability (later, optional)**: GitHub Sponsors / Open Collective for the open-source app; Teams can become a paid offering later without closing the personal app.

## 10. How to organize the work

### Repository and GitHub setup
1. After I confirm the license: create `pochimail/pochimail` with `gh`, **public** (decided 2026-11-17), default branch `main`. Protection: PRs + green CI required, **no required human review** (the reviewer agent is the review; I merge or approve merges in batches). Squash merge only, delete branches on merge.
2. Labels (keep it small): `type:feature|bug|chore|docs`, `area:core|mail|ai|ui|desktop|infra|design`, `p0|p1`, `blocked`. Add more only when filtering actually needs them.
3. Milestones (refine them):
   - **M0 Foundation:** monorepo, tooling, CI, docs, ADRs, AGENTS.md, design tokens in `packages/ui`
   - **M1 Core & events:** domain model (categories/topics/signals), event bus, outbox + job queue, use cases, in-memory adapters, fixture mailbox, CLI running the full pipeline on fixtures
   - **M2 Accounts & sync:** Gmail + Microsoft providers, OAuth + keychain, multi-account, SQLite storage, incremental sync with cursors, adaptive polling
   - **M3 Local AI:** rule engine, sender/template aggregation, embeddings + calibrated decision heads, local LLM with constrained decoding, topics and signals, hardware tiers, on-device learning from corrections, accuracy + latency eval in CI
   - **M4 Desktop shell & onboarding:** Electron processes, typed IPC with event streaming, welcome/connect/setup, background sorting home, summary
   - **M5 Actions & autonomy:** unsubscribe, archive, labels, batch actions, action log + undo, Just look / Suggest / Autopilot policies
   - **M6 Documents:** detection, dedupe, gallery, export
   - **M7 Keep it tidy:** scheduler, tray/login item, notifications, digests, settings
   - **M8 Release:** dark mode polish, accessibility pass, Rive mascot, packaging, code signing and notarization, auto-update (stable/beta) and model manifest updates, OAuth verification, docs site, v1.0
4. **Tracker (decided 2026-11-17): the GitHub Project "Pochimail v1"**, one draft item per ticket (title, description, fields Status / Milestone / Priority / Size / Area / Draft ID). No repo issues before v1 work needs them: a draft is converted to an issue when a worker picks it up, so its PR can close it. `docs/plan.md` shows the order.

### Issues
- One **epic** per milestone, child issues linked as sub-issues.
- Every issue: context, scope, explicit **acceptance criteria**, out-of-scope notes, dependencies ("blocked by #"), affected packages, size.
- Small enough for one sub-agent to finish in one PR.

### Delegation rules
- One issue → one sub-agent → one branch (`<type>/<issue-number>-<slug>`) → one PR that closes the issue.
- Respect dependency order; run independent issues in parallel.
- Every PR is reviewed by a separate reviewer agent against section 8 and the acceptance criteria before merge. CI must be green. Small chores (docs, config, renames) can go in one batched PR. Optimize for speed to a working v1: no ceremony that doesn't catch real bugs.
- **Definition of done:** acceptance criteria met, tests added, docs/ADR updated if behavior or architecture changed, no new knip/lint warnings.
- Ask me before: anything irreversible, adding a heavyweight dependency, changing an ADR decision, or closing a milestone.

### Keep the plan current
`docs/plan.md` and this brief are living documents. When a decision changes (by me or through an ADR), update `docs/plan.md`, the affected issues and `AGENTS.md` in the same PR.

### First run deliverables (then stop)
1. The decisions you need from me (code license, public or private repo, anything else blocking). Owner is decided: `pochimail/pochimail`.
2. `docs/plan.md` draft: milestones, epics, dependency graph, order of execution.
3. ADR drafts: monorepo layout and package manager, Electron process model + IPC streaming, hexagonal core + event bus + outbox/job queue, incremental sync and IDLE wake-ups, local storage, local AI runtimes and model selection, OAuth approach, notifications and privacy.
4. The full M0 and M1 issue list (titles, acceptance criteria, labels, dependencies) ready to create, plus epic-level issues for M2–M8.

Present these for my review. Create the repo and issues only after I approve.
