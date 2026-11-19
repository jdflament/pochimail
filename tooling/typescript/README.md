# @pochimail/typescript-config

## Why this package exists
One place for TypeScript compiler settings, so every workspace compiles with the same strictness (there is no root tsconfig, ADR 0001).

## Owns
- `base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and the per-target presets: `node-library`, `react-library`, `electron`.

## May import
Nothing (JSON only).

## Must not contain
- Per-package overrides that weaken strictness.
