# AGENTS.md

Rules for every change, by people or any coding agent. Some packages add their own `AGENTS.md`; the nearest one to the file you edit applies on top of this one. Reasons live in [docs/adr/](docs/adr/); the map is [ARCHITECTURE.md](ARCHITECTURE.md). An accepted ADR wins over any rule.

## Work
1. Work only from a GitHub issue. Read only what the issue lists, plus the README of each package you touch.
2. Before code, post a plan of at most 6 lines: files, each new file's single responsibility, reuse, deletions. Wait for approval.
3. Build only what the issue asks. Nothing "for later".
4. Ask before: a new dependency, package, pattern, scope or network host; changing an ADR; deviating from a design; anything irreversible.
5. One issue, one branch (`<type>/<issue>-<slug>`), one PR with the template. Conventional Commits.

## Code
6. Every file, export, prop, parameter and branch has a reason tied to the issue. Delete dead code you find.
7. One responsibility per file, at most 300 lines. One way to do each thing; a new pattern needs an ADR.
8. One source of truth for every value. Never copy a fact; link to it.
9. No `any`. zod at every boundary. Expected failures return `Result`.
10. Imports follow ARCHITECTURE.md and are enforced by `.dependency-cruiser.cjs`.
11. Tests go through public entry points and start with `// Guards: <the failure>`. Few, sharp tests.
12. Verify versions and APIs in official docs; pin exact versions.

## Packages
Every package is `packages/<name>` and is one of three kinds (ARCHITECTURE.md):
- **Domain** (accounts, mailbox, classification, cleanup, actions, documents): imports only `kernel` and `zod`. Never another domain, an adapter, `pipeline` or `ui`; another domain's data arrives as ids or events. Folders: `model/`, `ports/`, `policies/`, `use-cases/`, `events.ts`, `testing/` (in-memory adapters and contract suites, exported as `./testing`, used only by tests). One use case per intention: a class with injected ports and one `execute`.
- **Adapter** (db, net, gmail, graph, ai): implements domain ports and passes their contract suites. Never imports another adapter, except `gmail` and `graph` → `net`. No business rules. All network goes through `net`.
- **Shared** (kernel, workflows, pipeline, logger, ui, testing): see each README. Domains meet only in `workflows`.

A package passes its own tests alone: `pnpm --filter @pochimail/<name> test`.

## Product
13. Local only: no Pochimail server, no telemetry, no cloud AI.
14. Delete means move to the provider's Trash, after the user approves (ADR 0012). Autopilot never deletes.
15. Every action is logged and undoable, except unsubscribe, which the UI states first.
16. Never store or log email content, names, addresses, attachment names, unsubscribe URLs or tokens (ADR 0014). No real email or secrets anywhere in the repository. No personal names in code, docs, commits or PRs: say "the maintainer".

## Docs
17. Only the documents allowed in `tooling/ci/src/quality-rules.ts` may exist, within their word budget. Decisions go in an ADR of at most 400 words.

## Review
18. Reject a PR if: a file, export, prop or dependency has no reason in the issue; an acceptance criterion is unverified; a pattern is duplicated; a screen differs from its reference; a baseline grew. Reply with a verdict and at most 10 numbered findings with file and line.

## Gates
19. `pnpm check` must pass. Baselines only shrink. Never weaken a rule to pass.
