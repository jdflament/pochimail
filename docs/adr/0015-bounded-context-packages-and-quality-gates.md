# 0015 — Bounded-context packages and enforced quality gates

Status: Accepted (2026-11-19) · Amends: [ADR 0001](0001-monorepo-and-package-manager.md), [ADR 0003](0003-hexagonal-core-events-outbox.md)

## Context
`packages/core` grew into one package holding six business areas (accounts, sync, classification, recommendations, actions, documents) plus infrastructure (event bus, jobs, outbox, logger, OS ports). Nothing stopped one area from reaching into another, and rules in prose were not followed.

## Decision
- **Domain packages**, one per bounded context, flat under `packages/` like every other workspace: `accounts`, `mailbox`, `classification`, `cleanup`, `actions`, `documents`. Each owns its model, ports, policies, use cases and events, and imports only `@pochimail/kernel` and `zod`. Domains never import each other; they share ids and publish events.
- **`workflows`**: the only place domains meet. Event handlers turn one domain's events into another's commands (sync done → classify → recommend).
- **Adapter packages**: `db`, `net` (allow-listed HTTP, OAuth), `gmail`, `graph`, `ai`. Each implements domain ports and passes their contract suites; adapters never import each other, except `gmail` and `graph` → `net`.
- **Shared packages**: `kernel` (Result, ids, errors, clock, event envelope; nothing else), `pipeline` (event bus, jobs, outbox, scheduling), `logger`, `ui`, `testing` (fixture mailbox, eval).
- Each domain exports its in-memory adapters and contract suites under a `./testing` subpath, used only by tests.
- Every package is `packages/<name>`, states its kind and reason in its README, and passes its own tests alone. The kind's rules are in the root `AGENTS.md`.
- Enforced by `pnpm check`: dependency-cruiser boundaries, strict Biome, knip, and `tooling/ci` checks; existing debt is frozen in shrink-only baselines.

## Consequences
- The package names are the architecture; a contributor knows where code goes.
- Splitting `core` is a staged refactor with no behaviour change.

## Alternatives considered
- One core package: rejected; areas leak into each other.
- Domains importing each other: rejected; it recreates one core.
