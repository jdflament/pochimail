# @pochimail/kernel

## Why this package exists
Shared package.
The few types every domain needs to speak the same language, and nothing more.

## Owns
- `Result`, branded id helper, base domain error, `Clock` and `IdGenerator` ports, the event envelope type, and the `ERROR_CODES` registry (the one cross-domain list, because the logger and every adapter must recognise a code).

## May import
Nothing of ours.

## Must not contain
- Anything specific to one domain, apart from `ERROR_CODES`. A type used by one domain belongs in that domain.
