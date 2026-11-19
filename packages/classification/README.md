# @pochimail/classification

## Why this package exists
Domain package.
Understanding each email: type, signals and topics (ADR 0016), with confidence and a reason.

## Owns
- `EmailType`, `Signal`, `Topic`, classify and detect use cases, Keep rules keyed by sender hash.
- Ports: classifier (local AI), classification repository. Events: messages classified.

## May import
`@pochimail/kernel`, `zod`.

## Must not contain
- Model runtimes (they live in `packages/ai`), recommendations, actions.
