# 0002 — Electron process model and IPC streaming

Status: Accepted (2026-11-17, maintainer, M0-15; transport: in-house typed RPC, not tRPC) · Brief: §5.3 › Live UI updates, §5.4, §5.10 › Electron hardening · Research: M0-14

## Context
The UI must stay instant while a 100k-message sync and model inference run. Mail data must never reach a context that can be compromised by email content.

## Decision
- **main**: windows, lifecycle, tray/menu bar, login item, native notifications, OS integration, update checks, session network filter. Holds no mail data.
- **worker**: one `utilityProcess` running the composition root (core + db + mail + ai adapters + job workers). Owns the database.
- **model host**: a second `utilityProcess` for `node-llama-cpp` (and embeddings), so a model crash or OOM never takes the worker down; the worker talks to it through the `LlmProvider`/`Embedder` ports.
- **renderer**: React 19 SPA (electron-vite, Vite), TanStack Router/Query/Virtual/Table, React Compiler on. No Node access.
- **Transport**: main creates a `MessageChannelMain` and hands one port to the worker and one to the renderer (through the preload). **Renderer ↔ worker traffic bypasses main.** The preload exposes only `connectWorker(): MessagePort`-style capabilities plus a few OS calls (open external mail app link, show in Finder, choose folder) via `contextBridge`.
- **Protocol**: a typed RPC + subscription layer with **zod schemas shared by both sides** (`apps/desktop/src/shared/ipc/`). Queries/mutations validate input and output; subscriptions stream domain events and progress. **Choice (M0-14): in-house typed RPC + subscription layer** over the MessagePort, ~300 lines, same shape as tRPC. See "IPC transport research (M0-14)".
- **Renderer data**: TanStack Query caches updated from event subscriptions (no polling); optimistic mutations reconciled on `ActionApplied` / `ActionFailed`.
- **Hardening**: contextIsolation, sandbox, no nodeIntegration, `webSecurity`, strict CSP (no remote, no inline scripts), navigation and `window.open` blocked, permission requests denied by default, Electron Fuses (RunAsNode off, cookie encryption on, ASAR integrity on, only-load-app-from-asar), Electron kept on a supported major.
- **Untrusted HTML** (only if a preview ever needs it): sandboxed `<iframe sandbox>` with its own CSP, remote images blocked, no preload.

## Implementation notes (M0-09)
- Skeleton in `apps/desktop`: `electron-vite` 6, Electron 45, React 19 + React Compiler (`@vitejs/plugin-react` 6 with `@rolldown/plugin-babel`), TanStack Router (code-based, memory history because the renderer loads from `file://`).
- The page requests the worker port through `window.pochimail.requestWorkerPort()`; the preload forwards the `MessagePort` main created with `window.postMessage`. After that, renderer and worker talk directly.
- CSP is injected into `index.html` at build time from `src/shared/csp.ts` (strict in production, relaxed for the Vite dev server only). The production CSP has no `unsafe-inline` at all (React style props set styles through CSSOM, which CSP does not block).
- The session request filter (`src/main/security.ts`) has an empty host allowlist and logs the blocked host only.
- Fuses are defined in `src/main/fuses.ts` and applied at packaging (M0-10) by `apps/desktop/packaging/apply-fuses.ts`, an electron-builder `afterPack` hook (skipped for the per-arch slices of the macOS universal build; the merged app is flipped). `pnpm package:smoke` reads the fuses back from the packaged binary. `GrantFileProtocolExtraPrivileges` is left at its default while the renderer loads from `file://`.
- Electronegativity's last release is from 2023, so the baseline is enforced by a checklist test (`src/main/security.test.ts`).

## IPC transport research (M0-14)
**Adapters checked (2026-11-17, `npm view` and package contents):**
- `electron-trpc` 1.0.0 (maintained, peers `@trpc/*` ^11.10): built on `ipcMain`/`ipcRenderer` and `contextBridge`. No MessagePort or `utilityProcess` code, so every message passes through a main-process handler. That contradicts "renderer ↔ worker traffic bypasses main" and puts mail data in main.
- `trpc-electron` 0.1.2 (last release January 2025) and `electron-trpc-experimental` 1.0.0-alpha.1 (alpha, June 2025): same `ipcMain`/`ipcRenderer` model, and less maintained.
- No maintained adapter targets MessagePort between a renderer and a `utilityProcess`.

**Decision: in-house typed RPC + subscriptions.** Adopting tRPC would also add `@trpc/server`/`@trpc/client` (supply chain, [AGENTS.md §6](../../AGENTS.md)) and a custom link for little gain. Keep the shape (procedures with zod input/output, subscriptions) so tRPC stays a possible later swap. The M0-09 echo RPC is the starting point.

**Event streaming with backpressure (benchmark):** the worker buffers events and posts one `batch` message per 50 ms flush. At most 2 batches are unacknowledged; the renderer acks after processing each batch, and while the limit is reached the worker keeps buffering (coalescing into larger batches) instead of posting. Order is preserved and nothing is dropped. Each batch is validated once with zod.
Prototype: `apps/desktop/src/shared/ipc/batching.bench.test.ts`, a benchmark (the batcher lives in the test file; the production layer comes in a later ticket). The default test run only checks lossless in-order delivery; timing assertions run with `POCHI_BENCH=1`. Node `MessageChannel`, 5 runs on one machine (Apple Silicon, Node 26):

| Scenario | Events | Messages | p95 latency | Max buffered |
|---|---|---|---|---|
| 1000 events/s for 3 s, fast consumer | 3000, all in order | 100–112 (about 35/s, vs 1000 unbatched) | 47 ms | 50–84 |
| 1000 events/s for 2 s, consumer takes 120 ms per batch | 2000, all in order | 34 | 185 ms | 73 |

Rules for the production layer: flush every 50 ms or at a max batch size; ack-gated in-flight window of 2; events that are only the latest state (progress) are coalesced per key before posting; subscription teardown on port close. Caveat: measured in Node, not across real Electron processes; re-check in the E2E suite (M0-10).

## Consequences
- Every IPC message is schema-validated twice (cheap at our volumes; batch events).
- The worker can be restarted by main without losing state (jobs are persistent, ADR 0003).

## Alternatives
Everything in main (blocks UI, bigger attack surface) · Node worker_threads only (no process isolation for native crashes) · `ipcRenderer.invoke` through main (extra hop, main becomes a bottleneck).

## To verify
Current Electron major and `utilityProcess` + `MessagePortMain` APIs; maintained tRPC/Electron adapters; React Compiler + Vite plugin status.
