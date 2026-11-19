# @pochimail/logger

## Why this package exists
Shared package.
One structured logger with redaction, used by every process. Privacy-critical: it guarantees subjects, bodies, addresses, attachment names and tokens never reach a log, so it is isolated and tested on its own (ADR 0015).

## Owns
- `createLogger` and its sinks; redaction of strings, records, errors and stacks.

## May import
Nothing of ours.

## Must not contain
- Anything that is not logging.
