# 0001 — Monorepo layout and package manager

Status: Proposed · Brief: §5.1, §5.8, §8 › Tooling · Research: M0-01 (study current Midday + create-t3-turbo)

## Context
One desktop app now, a mobile companion (Expo) later, shared domain code. Midday is the reference for structure; create-t3-turbo for `packages/ui` with shadcn; AFFiNE for desktop + mobile sharing one core.

## Decision
- **Turborepo + pnpm workspaces.** pnpm over Bun (Midday's choice) because electron-builder, `@electron/rebuild` and native modules (`node-llama-cpp`, SQLite, `onnxruntime-node`) are best supported with Node + pnpm, and Expo supports pnpm. `node-linker=hoisted` only if electron-builder packaging requires it (verify).
- Layout:
  ```
  apps/desktop        Electron: src/main, src/preload, src/worker, src/renderer
  apps/cli            dev-only CLI running the pipeline on fixtures (private, never shipped)
  packages/core       entities, events, ports, policies, use cases — pure TS
  packages/db         SQLite schema, migrations, repositories, outbox/job tables
  packages/mail       providers: gmail, microsoft-graph, imap (+ presets)
  packages/ai         rules, aggregation, embeddings/heads, LLM, prompts, training/
  packages/ui         shadcn/ui components, tokens, fonts, brand, mascot (@pochimail/ui)
  packages/testing    in-memory adapters, port contract suites, fixture mailboxes, eval harness
  tooling/typescript  @pochimail/typescript-config (base, node-library, react-library, electron)
  docs/               brief, product, design, mascot, plan, adr/, design/, security/
  ```
- Package names `@pochimail/<name>`, all `private: true`, never published.
- Rules: `exports` in every package.json (no `main`), **no barrel files**, no `../` across packages, **no root tsconfig** (each package extends `@pochimail/typescript-config`), internal packages consumed as TS source (no build step) except where Electron main/worker bundling needs it (electron-vite bundles them).
- Biome (lint + format) at the root, manypkg for consistent versions, knip for dead code, Vitest everywhere.
- Node version pinned in `.nvmrc` + `engines` + `packageManager` field.
- The IPC contract (zod schemas) lives in `apps/desktop/src/shared/` since only the desktop app uses it in v1 (moves to a package when mobile needs it).

## Consequences
- Turbo task graph: `typecheck`, `lint`, `test`, `build`, `knip`, `eval`.
- `core` must stay free of Node/DOM/Electron APIs: enforced by its tsconfig `lib`/`types` and a Biome import restriction.

## Alternatives
Bun (faster installs, Midday parity; weaker electron-builder/native-module story) · Nx (heavier) · single package (blocks mobile reuse).

## To verify
Current Midday layout and tooling; current shadcn monorepo docs; electron-vite + pnpm workspace packaging of internal TS packages.
