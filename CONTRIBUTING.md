# Contributing to Pochimail

Keep it light: this is a solo-maintained project with agent help. Read [AGENTS.md](AGENTS.md) first; it holds the full rules and links to the brief sections they come from. For current progress and work items, see [docs/status.md](docs/status.md) and [docs/tickets/](docs/tickets/).

## Setup
Requirements: Node and pnpm at the versions pinned in `.nvmrc` and the `packageManager` field of `package.json`.

```sh
pnpm install
pnpm check      # typecheck + test today; lint, knip and manypkg join in M0-04
pnpm test
```

CI: a pull request runs the Linux gate for fast feedback (macOS and Windows show as skipped); the merge queue and `main` run the full gate on all three OSes.

`pnpm install` also downloads the Electron binary. Electron 45 ships no install hook, and pnpm runs no dependency build script unless `pnpm-workspace.yaml` lists it under `allowBuilds`, so the binary comes from the `postinstall` script of `apps/desktop` (`install-electron`); the `allowBuilds` entry for `electron` stays for Electron versions that bring a hook back. Start the app with `pnpm --filter @pochimail/desktop dev` (the root has no `dev` script), and if it fails with Electron's "failed to install correctly" error, rerun `pnpm --filter @pochimail/desktop exec install-electron`.

Scripts are defined at the repository root and run through Turborepo. If a command above is missing, the scaffold is still in progress: see `package.json`.

## Your own OAuth client IDs
Official builds use the project's verified Google and Microsoft client IDs. **Forks and local development builds must register their own** and pass them through environment variables or local config. Never hard-code or commit them.

- Google: create an OAuth client (Desktop app) in Google Cloud and enable the Gmail API. Use test users until verified.
- Microsoft: register a public client app in Microsoft Entra (redirect `http://127.0.0.1`).
- Set the variables named in [ADR 0007](docs/adr/0007-oauth-credentials-scopes.md) (e.g. `POCHIMAIL_GOOGLE_CLIENT_ID`) in a local, git-ignored env file.
- Generic IMAP accounts need no client ID (app password or provider OAuth).

## Workflow
- Work comes from the GitHub Project "Pochimail v1" (converted to issues when started). One issue → one branch (`<type>/<issue-number>-<slug>`) → one PR that closes it.
- **Conventional Commits**: `feat(core): add suggestion policy`, `fix(mail): handle expired history id`, `docs: …`, `chore: …`.
- Add tests that guard a real failure, keep CI green (typecheck, lint, test, build, knip, eval), and update docs or ADRs when behavior or architecture changes.
- Squash merge only.
- Never include real email content, addresses or secrets in issues, fixtures or screenshots.

## Licensing
Contributions are accepted under AGPL-3.0. There is no CLA; once outside contributors arrive, commits will need a DCO sign-off (`git commit -s`). The name, logo and mascot are not part of the code license: see [TRADEMARKS.md](TRADEMARKS.md).

Security issues: see [SECURITY.md](SECURITY.md), not public issues.
