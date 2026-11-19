# @pochimail/ai

## Why this package exists
Adapter package.
Local models behind the classification ports: types, signals, topics (ADR 0006, 0016).

## Owns
- Model manifest and SHA-256 checks, inference per hardware tier, output validation, `bench/` (dev only).

## May import
`@pochimail/classification` (port types), `kernel`, `logger`, model runtimes.

## Must not contain
- Network inference, business rules.
