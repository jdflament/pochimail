# 0003 — Hexagonal core, event bus, outbox and job queue

Status: Accepted (2026-11-17, maintainer, M0-15) · Brief: §5.2, §5.3, §8 › Backend

## Decision
- **Ports** in `core`: `MailProvider`, `MessageRepository` (+ Sender/Thread/Suggestion/ActionLog repositories), `BlobStore`, `SecretStore`, `Classifier`/`Embedder`/`LlmProvider`, `Exporter`, `JobQueue`, `EventBus`, `Scheduler`, `Notifier`, `Clock`, `Logger`, `PowerMonitor`, `Platform` (deviceName, paths).
- **Entities** carry `workspaceId` and branded IDs (`AccountId`, `MessageId`, `WorkspaceId`…). Expected failures are `Result<T, E>` values; exceptions are bugs.
- **Central flow**: Suggestion → Approval (or `autonomyPolicy`) → Action (command + inverse + idempotency key) → ActionLog. Invariants (no delete, People protected, confidence threshold, Just look = read-only) live in one pure `policy` module, plus an `authorize(actor, workspace, operation)` function that always allows in v1.
- **Events**: typed union (`AccountConnected`, `SyncBatchFetched`, `MessagesUpserted`, `MessageClassified`, `SignalDetected`, `SuggestionCreated`, `SuggestionApproved`, `ActionApplied`, `ActionFailed`, `ActionUndone`, `AttachmentSaved`, `ScanProgressed`, `ScanCompleted`, `DigestReady`), each zod-described and versioned.
- **Transactional outbox**: a use case writes domain rows **and** its events/jobs in one SQLite transaction (`UnitOfWork` port). A dispatcher publishes outbox rows to the in-process bus and marks them sent. Delivery is **at-least-once**, so every handler is idempotent (keyed by event id).
- **Job queue** (SQLite table): kind, payload, priority, `runAfter`, attempts, lease owner/expiry, cursor. Workers lease jobs, extend leases, retry with exponential backoff + jitter, dead-letter after N attempts. Jobs survive restarts.
- **Pipeline**: sync → parse → classify → signals → suggestions as stages; each stage consumes the previous stage's events in **batches** with **bounded concurrency**, **backpressure** (stage pauses when its downstream queue depth > threshold) and **AbortController** cancellation for pause/resume.
- **One composition root per app** (`apps/desktop/src/worker/compose.ts`, `apps/cli/src/compose.ts`).
- In-memory implementations of every port live in `packages/testing`, with **port contract test suites** that the SQLite/provider adapters must also pass.

## Consequences
Core is unit-testable without Electron; event flows are tested end to end in memory; adapters prove conformance by running the same contract suites.

## Alternatives
Event sourcing (overkill; ActionLog already gives history) · external queue (no server allowed).
