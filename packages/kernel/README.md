# @pochimail/kernel

## Why this package exists
Shared package.
The few types every domain needs to speak the same language, and nothing more.

## Owns
- `Result`, branded id helper, base domain error, `Clock` and `IdGenerator` ports, the event envelope type.

## May import
Nothing of ours.

## Must not contain
- Anything specific to one domain. A type used by one domain belongs in that domain.
