## Start here

- Read [`docs/status.md`](docs/status.md) for current progress and next work.
- Read the ticket in [`docs/tickets/`](docs/tickets/) for the task you are doing.
- Read the brief sections listed by that ticket, plus [§1 vision and principles](docs/brief.md) and [§8 standards](docs/brief.md).

## 0. Non-negotiables (read before anything else)

**Plan first.** Before writing code, post a plan of at most 6 lines: files to touch, each new piece with a one-line reason, what existing code it reuses, what it deletes. No code until the plan is approved. Implement exactly the plan; if the plan turns out wrong, stop and re-plan.

**Match the designs exactly.** `docs/design/screens/` (html/, light/, dark/, phone/, narrow-window/, source/ for motion) is the spec. Layout, placement, proportions, type and spacing scale, sizes and visuals must match. Before opening a PR, render the screen at the reference viewport, screenshot it, compare it side by side with the reference, and fix every difference. Put the screenshot pair in the PR. "Same structure, different pixels" is a bug.

**Code quality.**
- Composition over configuration: no boolean or "mode" props that switch what a component is. Split into parts or compose.
- Names say what the thing is, in the component's own terms. A `Mascot` takes no `showPochi`; a provider is named for the setting it holds.
- Build only what a ticket needs now. No speculative options, wrappers, abstractions or "for later" code. Delete rather than keep unused code.
- Reuse before creating: check `packages/ui` and the feature folder first. A new `packages/ui` component only if `docs/design.md` names it.
- One source of truth for every value (tokens, timings, copy, policies). No duplicated lists or literals.
- Follow the established patterns of the codebase (shadcn conventions, hexagonal core, use cases behind ports). Do not invent a second way.
- Every package has one reason to exist and owns one capability, strictly separated (like midday-ai/midday packages). No catch-all package where everything lands; new code goes in the package that owns that capability.

**Neutral wording.** Never write a personal name in code, docs, commits, PR titles or PR bodies.

# AGENTS.md — rules for every agent working on Pochimail

Pochimail is a privacy-first, local-only desktop assistant that sorts and cleans mailboxes. It is **not** a mail client. Product definition (decided 2026-11-19): an assistant that helps you tidy your mailboxes, keep what matters (newsletters, emails, attachments) and guides you to stay organized by setting things up for you, such as tags/labels in your mail provider. Every rule below links to the brief section it comes from (`docs/brief.md`, "§"). **The brief wins over everything**, then `docs/plan.md` (decisions D1–D8 and P1–P15, all decided by the maintainer on 2026-11-17), then `docs/adr/`. If two sources disagree, follow the higher one and say so in your PR.

## 1. Read first
- Read the brief sections your ticket lists, plus [§1 vision and principles](docs/brief.md) and [§8 standards](docs/brief.md). Skim `docs/plan.md` and the ADRs in `docs/adr/` that touch your area.
- UI work: `docs/design.md`, `docs/mascot.md`, `docs/product.md`, and the reference screens in `docs/design/screens/` ([§6](docs/brief.md)).
- Verify versions and docs of every tool or dependency against the registry (`npm view`) and current docs; never from memory ([§9](docs/brief.md)). Pin exact versions in `dependencies` and `devDependencies`; `peerDependencies` use ranges.

## 2. Product invariants (never break)
Source: [§1 core principles](docs/brief.md), [§2 invariants](docs/brief.md).
- Local-first: mail, AI and the vault stay on the device; no backend, no telemetry by default.
- The assistant proposes, the user decides (Autopilot only within strict limits).
- Never delete mail (archive instead). Never touch People mail without explicit approval. Preview every batch. Log every action. Everything is undoable.
- Never block the user: heavy work runs in the background with live progress.
- Local AI only: no cloud model, no API key, no inference over the network ([§3](docs/brief.md)).
- Out of scope in v1: reading or composing mail, deleting mail, mobile app, cloud AI, Teams ([§4](docs/brief.md)). Teams stays a disabled "Teams · Soon" item ([§5.6](docs/brief.md)).

## 3. Repository and package boundaries
Source: [§5.1](docs/brief.md), [§5.2](docs/brief.md), [ADR 0001](docs/adr/0001-monorepo-and-package-manager.md), [ADR 0003](docs/adr/0003-hexagonal-core-events-outbox.md).
- Turborepo + pnpm workspaces. Packages are `@pochimail/<name>`, `private: true`, never published.
- `packages/core` is pure TypeScript: no `node:*`, Electron or DOM APIs. It defines ports, entities, events, policies and use cases; adapters live elsewhere. One composition root per app.
- `exports` in every `package.json`; **no barrel files**; no `../` imports across packages; **no root tsconfig** (extend `@pochimail/typescript-config`).
- Every entity carries `workspaceId`; authorization goes through one policy function ([§5.6](docs/brief.md)).
- Platform-specific code sits behind a port with one adapter per OS ([§5.9](docs/brief.md)). Never hard-code "Mac": use `deviceName()`.
- Read the repository owner from one config value (`repository` in `package.json`, updater `publish` config); never hard-code it ([brief header](docs/brief.md)).
- Events, outbox, idempotent reversible actions, bounded concurrency and cancellation follow [§5.3](docs/brief.md).

## 4. Code standards
Source: [§8](docs/brief.md). Gates: `pnpm check` runs typecheck, lint (Biome), knip, test and manypkg. CI runs it on macOS, Windows and Linux (`.github/workflows/ci.yml`, M0-05); `pnpm gates` fails any gate that runs zero tasks. Renovate (`renovate.json`) and an `osv-scanner` CI job are live (M0-06).
See §0.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. **No `any`.** Biome (lint + format), manypkg, knip (live, M0-04); CI (live, M0-05); Renovate (live, M0-06).
- zod at every boundary: IPC, provider responses, LLM output. Expected failures are `Result` values; exceptions are for bugs. Branded IDs (`MessageId`, `AccountId`, `WorkspaceId`).
- Explicit use cases with dependencies injected through ports.
- Frontend: React 19 function components (no `forwardRef`), `data-slot`, CVA variants, `cn()`, exported `VariantProps`, `asChild` via Slot, `focus-visible`; wrap primitives, don't fork them. Composition over boolean props. Renderer layout `features/<name>/` + `components/`. Worker data in TanStack Query fed by IPC events; filters in the router; virtualize large lists; forms with react-hook-form + zod.
- Tests: Vitest (unit/integration), Playwright (Electron E2E), Storybook with accessibility + contrast checks. Test behaviour through public entry points, each test guarding a named failure; few sharp tests. `core` is tested with in-memory adapters; adapters against recorded fixtures; the fixture mailbox doubles as the eval set.
- CI gate on every PR: typecheck, lint, test, build, knip, eval-regression (`pnpm eval`; refresh the baseline on purpose with `pnpm --filter @pochimail/testing eval:update-baseline`). Nothing merges red.

## 5. Privacy and logging
Source: [§5.10](docs/brief.md), [§8 Backend](docs/brief.md), [ADR 0008](docs/adr/0008-notifications-and-privacy.md).
- Structured logger with redaction. **Never log subjects, bodies, addresses or attachment names**, and never tokens.
- No telemetry; no crash reporting in v1. Notifications show counts, not names or subjects, unless the user opts in ([§5.5](docs/brief.md)).
- Network only to: Google/Microsoft APIs, the IMAP/SMTP hosts of connected accounts, GitHub Releases, the model manifest and its hosts (exactly `huggingface.co` and `us.aws.cdn.hf.co`, no wildcard), enforced by a session-level request filter. Plan P1 (accepted): one exception, the RFC 8058 one-click unsubscribe POST to the exact `List-Unsubscribe` URL through one dedicated logged path. Do not add an outbound host without documenting it and asking ([§5.10](docs/brief.md)).
- Update checks send no identifiers ([§5.7](docs/brief.md)).
- Never put real mail, addresses or secrets in fixtures, tests, docs or screenshots; use the mock dataset ([§6 Mock data](docs/brief.md)).
- Fixtures and demo data (`packages/testing`, the fixture mailbox, `POCHIMAIL_DEMO`) are for **developers and contributors only**: exclude them from production builds **at build time**, not just behind a runtime gate, so the shipped app stays light ([D13](docs/plan.md)).

## 6. Security rules
Source: [§5.10](docs/brief.md), [§5.4](docs/brief.md), [ADR 0002](docs/adr/0002-electron-process-model-and-ipc.md), [ADR 0005](docs/adr/0005-local-storage.md), [ADR 0007](docs/adr/0007-oauth-credentials-scopes.md).
- Encrypted database at rest; key and OAuth refresh tokens only in the OS keychain (`safeStorage`), never in files or logs.
- Least-privilege scopes; never a delete scope.
- Electron: `contextIsolation`, sandbox, no `nodeIntegration`, narrow preload via `contextBridge`, strict CSP, navigation and new-window blocking, `webSecurity` on, Fuses set.
- Email content is untrusted: never execute or render remote content; remote images blocked; never follow links in email bodies. Unsubscribe only via RFC 8058 one-click or `mailto:` ([§4](docs/brief.md)). Attachments are hashed and stored only when the user saves them (D11), never opened automatically. Never persist message bodies.
- OAuth client IDs come from env/config, never hard-coded ([§9b](docs/brief.md)).
- Supply chain: pinned lockfile, minimal dependencies; ask before adding a heavyweight one ([§10](docs/brief.md)). CI runs osv-scanner on the lockfile; planned: an SBOM per release ([§5.10](docs/brief.md)).
- pnpm's `minimumReleaseAge` stays on: we rely on pnpm 12's default, so do not add config for it; never add release-age exclusions without an ADR note.
- Releases: signed and notarized builds with signed update metadata; SHA-256 checks on model files; keep Electron on a supported version ([§5.10](docs/brief.md)).
- Threat model: [docs/security/threat-model.md](docs/security/threat-model.md); outbound hosts: [docs/security/network.md](docs/security/network.md). Update both when you add a boundary, a mitigation or a host.

## 7. Design rules
Source: [§6](docs/brief.md); details in `docs/design.md` and `docs/mascot.md`.
See §0.
- Use the tokens in `packages/ui` as-is; **never hard-code colors**. Two type families only: Newsreader (screen titles, big figures, Pochi) and Instrument Sans (UI); never italic display serif.
- Style: calm, editorial, hairline rules and typography instead of boxes; ledgers, not stat tiles; radii 16 (cards/panels), 10–12 (buttons/inputs), full (pills).
- Anti-patterns: no cards inside cards, icon-tile stacks, numbered section labels, eyebrow chips, thin borders with wide shadows, beige "AI" palettes, pulsing dots, generic spinners (use skeletons and real progress), gradients or emoji.
- Interaction and accessibility: real `button`/`a`/`input`/switch/checkbox/radio, keyboard reachable, visible `focus-visible`; targets ≥ 32px (44px primary buttons); one `h1` per screen; progress uses `role="status"` + `aria-live="polite"`; contrast ≥ 4.5:1; never color alone; copy that survives French/Japanese expansion.
- Motion: 150ms feedback, 200–250ms panels, easing `cubic-bezier(0.22, 1, 0.36, 1)`, press scale 0.98; no looping animation except Pochi's idle breathing; respect `prefers-reduced-motion`.
- Wording: "email/emails" (never "mails"), "Pochi" or "I" for the assistant, "Review" to open a list, "Undo" to reverse. Screen titles are functional ("Overview"), never greetings. No placeholder tokens like "[X]" in UI. Always reassure on privacy and reversibility where data is processed or changed ([Voice](docs/brief.md)).
- Every empty/error/update state and motion is a feature with its own tests ([§6](docs/brief.md)).

## 8. Tickets, branches, PRs, commits
Source: [§10](docs/brief.md), [§8 Open-source hygiene](docs/brief.md), [§9b Contributions](docs/brief.md).
- **Tickets live in the GitHub Project "Pochimail v1"** (draft items, converted to issues when work starts). Draft IDs (`M0-01`…) go in the issue body. Order and dependencies: `docs/plan.md`.
- **Delegation rules ([§10](docs/brief.md))**: one issue → one sub-agent → one branch → one PR that closes the issue. Respect dependency order; run independent issues in parallel. Every PR is reviewed by a separate reviewer agent against §8 and the acceptance criteria before merge; CI must be green. Small chores (docs, config, renames) may go in one batched PR. No ceremony that doesn't catch real bugs.
- Branch: `<type>/<issue-number>-<slug>` (types `feature|bug|chore|docs`). Squash merge only; branches deleted on merge.
- Every PR that finishes a ticket updates [`docs/status.md`](docs/status.md) (move it to Done with the PR number) in the same PR.
- Commits: Conventional Commits (`feat(core): …`). No CLA; DCO sign-off (`git commit -s`) only once outside contributors arrive.
- Labels: `type:*`, `area:*`, `p0|p1`, `blocked`. Keep them few.
- Do not commit, push or touch GitHub unless your ticket says so.

## 9. Definition of done
Source: [§10](docs/brief.md).
Acceptance criteria met · tests added · docs/ADR updated if behavior or architecture changed · no new knip/lint warnings. Report how each criterion was verified (command + result), plus deviations and open questions.

## 10. Keep the plan current
When a decision changes, update `docs/plan.md`, the affected issues and this file in the same PR ([§10](docs/brief.md)).

## 11. When to ask
Ask the coordinator/maintainer **before**: anything irreversible; adding a heavyweight dependency; changing an ADR decision; closing a milestone; adding an outbound network host; deviating from the brief ([§10](docs/brief.md)). Otherwise pick the sensible default, state it in the PR and continue.
