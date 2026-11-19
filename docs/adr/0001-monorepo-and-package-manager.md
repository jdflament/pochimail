# 0001 — Monorepo layout and package manager

Status: Accepted (2026-11-17) · Amended by [0015](0015-bounded-context-packages-and-quality-gates.md) (package layout)

## Context
One desktop app now, a mobile companion later, shared domain code.

## Decision
- **Turborepo + pnpm workspaces.** pnpm over Bun because electron-builder, `@electron/rebuild` and native modules (`node-llama-cpp`, SQLite, `onnxruntime-node`) are best supported with Node and pnpm. Keep pnpm's default `node-linker`; use `hoisted` only if packaging fails without it.
- Workspaces: `apps/desktop` (Electron: `src/main`, `preload`, `worker`, `renderer`), `apps/cli` (dev-only fixture pipeline CLI, private, never shipped), `packages/*`, `tooling/typescript` (`@pochimail/typescript-config`). The package list is in [ADR 0015](0015-bounded-context-packages-and-quality-gates.md).
- Names are `@pochimail/<name>`, all `private: true`, never published.
- Every package.json has `exports` (no `main`). No barrel files, no `../` across packages, no root tsconfig (each package extends the shared config). Internal packages are consumed as TypeScript source; electron-vite bundles them.
- Biome (lint and format) at the root, manypkg for consistent versions, knip for dead code, Vitest everywhere.
- Node is pinned in `.nvmrc`, `engines` and `packageManager`.
- The IPC contract (zod schemas) lives in `apps/desktop/src/shared/` while only the desktop app uses it; it moves to a package when mobile needs it.
- Turbo tasks: `typecheck`, `lint`, `test`, `build`, `knip`, `eval`.

## Consequences
Domain packages stay free of Node, DOM and Electron APIs, enforced by tsconfig `lib`/`types` and dependency rules.

## Alternatives considered
Bun (faster installs, weaker electron-builder and native-module support) · Nx (heavier) · a single package (blocks mobile reuse).
