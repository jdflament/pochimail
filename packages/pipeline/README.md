# @pochimail/pipeline

## Why this package exists
Shared package.
Runs the work: delivers events, processes the job queue with batching, backpressure and retries, relays the outbox, and schedules by power state.

## Owns
- Event bus, job queue runner, outbox relay, retry policy, scheduler and power awareness.

## May import
`@pochimail/kernel`, `@pochimail/logger`.

## Must not contain
- Domain knowledge: it runs handlers it is given (`workflows` provides them).
