# 0002 — Electron process model and IPC streaming

Status: Proposed · Brief: §5.3 › Live UI updates, §5.4, §5.10 › Electron hardening · Research: M0-14

## Context
The UI must stay instant while a 100k-message sync and model inference run. Mail data must never reach a context that can be compromised by email content.

## Decision
- **main**: windows, lifecycle, tray/menu bar, login item, native notifications, OS integration, update checks, session network filter. Holds no mail data.
- **worker**: one `utilityProcess` running the composition root (core + db + mail + ai adapters + job workers). Owns the database.
- **model host**: a second `utilityProcess` for `node-llama-cpp` (and embeddings), so a model crash or OOM never takes the worker down; the worker talks to it through the `LlmProvider`/`Embedder` ports.
- **renderer**: React 19 SPA (electron-vite, Vite), TanStack Router/Query/Virtual/Table, React Compiler on. No Node access.
- **Transport**: main creates a `MessageChannelMain` and hands one port to the worker and one to the renderer (through the preload). **Renderer ↔ worker traffic bypasses main.** The preload exposes only `connectWorker(): MessagePort`-style capabilities plus a few OS calls (open external mail app link, show in Finder, choose folder) via `contextBridge`.
- **Protocol**: a typed RPC + subscription layer with **zod schemas shared by both sides** (`apps/desktop/src/shared/ipc/`). Queries/mutations validate input and output; subscriptions stream domain events and progress. Use tRPC over a MessagePort link if a maintained adapter exists (M0-14), otherwise a ~300-line in-house layer with the same shape.
- **Renderer data**: TanStack Query caches updated from event subscriptions (no polling); optimistic mutations reconciled on `ActionApplied` / `ActionFailed`.
- **Hardening**: contextIsolation, sandbox, no nodeIntegration, `webSecurity`, strict CSP (no remote, no inline scripts), navigation and `window.open` blocked, permission requests denied by default, Electron Fuses (RunAsNode off, cookie encryption on, ASAR integrity on, only-load-app-from-asar), Electron kept on a supported major.
- **Untrusted HTML** (only if a preview ever needs it): sandboxed `<iframe sandbox>` with its own CSP, remote images blocked, no preload.

## Consequences
- Every IPC message is schema-validated twice (cheap at our volumes; batch events).
- The worker can be restarted by main without losing state (jobs are persistent, ADR 0003).

## Alternatives
Everything in main (blocks UI, bigger attack surface) · Node worker_threads only (no process isolation for native crashes) · `ipcRenderer.invoke` through main (extra hop, main becomes a bottleneck).

## To verify
Current Electron major and `utilityProcess` + `MessagePortMain` APIs; maintained tRPC/Electron adapters; React Compiler + Vite plugin status.
