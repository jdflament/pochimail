# @pochimail/kernel

## Why this package exists
Shared package.
The few types every domain needs to speak the same language, and nothing more.

## Owns
- `Result`, branded id helper and the shared ids (workspace, account, message, thread, topic) with their zod schemas, the base domain error and the storage, not-found and provider failures, `Clock` and `IdGenerator` ports, the event envelope with `defineEvent` and the `EventSink` port, and the `ERROR_CODES` registry (the one cross-domain list, because the logger and every adapter must recognise a code).

## May import
`zod`.

## Must not contain
- Anything specific to one domain, apart from `ERROR_CODES`. A type used by one domain belongs in that domain.
