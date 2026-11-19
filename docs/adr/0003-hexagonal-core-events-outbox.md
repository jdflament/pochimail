# 0003 — Hexagonal domains, event bus, outbox and job queue

Status: Accepted (2026-11-17) · Amended by [0015](0015-bounded-context-packages-and-quality-gates.md) (ports and use cases live in domain packages)

## Decision
- **Ports** are interfaces owned by the domain that needs them: `MailProvider`, repositories, `BlobStore`, `SecretStore`, classifier and model ports, `Exporter`, `JobQueue`, `EventBus`, `Scheduler`, `Notifier`, `Clock`, `Logger`, `PowerMonitor`, `Platform`.
- **Entities** carry `workspaceId` and branded ids. Expected failures are `Result` values; exceptions are bugs.
- **Central flow**: Suggestion → Approval (or autonomy policy) → Action (command, inverse, idempotency key) → ActionLog. Invariants (People protected, confidence threshold, Just look is read-only, deletion rules of [ADR 0012](0012-delete-moves-to-trash-with-approval.md)) live in one pure policy module, plus `authorize(command, ctx)`, which always allows in v1.
- **Events** are a typed, zod-described, versioned union.
- **Transactional outbox**: a use case writes domain rows and its events and jobs in one SQLite transaction (`UnitOfWork`). A dispatcher publishes outbox rows to the in-process bus. Delivery is at-least-once, so every handler is idempotent, keyed by event id.
- **Job queue** (SQLite): kind, payload, priority, `runAfter`, attempts, lease owner and expiry, cursor. Workers lease and extend jobs, retry with exponential backoff and jitter, and dead-letter after N attempts. Jobs survive restarts.
- **Pipeline**: sync → classify → signals → recommendations as stages, each consuming the previous stage's events in batches with bounded concurrency, backpressure and `AbortController` cancellation for pause and resume.
- One composition root per app (`apps/desktop/src/worker/compose.ts`, `apps/cli/src/compose.ts`).
- In-memory implementations of every port come with **port contract suites** that the SQLite and provider adapters must also pass.

## Consequences
Domains are unit-testable without Electron; event flows are tested end to end in memory; adapters prove conformance with the same suites.

## Alternatives considered
Event sourcing (the ActionLog already gives history) · an external queue (no server allowed).
