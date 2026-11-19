# @pochimail/core

## Why this package exists
Transitional. It holds the domain model, ports, policies, use cases, events and jobs until it is split into domain packages and `kernel` (ADR 0015); then it is deleted.

## Owns
Entities, ports, autonomy and authorization policies, use cases, the event bus and the scan pipeline, all as plain TypeScript.

## May import
Its own files and `zod`. Nothing else (enforced: legacy-core-is-pure, legacy-core-npm-allowlist).

## Must not contain
- Node, DOM or Electron APIs, SQL, HTTP or model calls: they belong behind ports.
- New features: new code goes in the target domain package.
