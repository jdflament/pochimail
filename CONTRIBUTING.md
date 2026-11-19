# Contributing

Read [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md) first. Packages that need area rules have their own short `AGENTS.md`, and each has a README saying what it owns. Any coding agent that supports AGENTS.md picks them up; do not add tool-specific instruction files.

## Setup
Node and pnpm versions are pinned in `.nvmrc` and `package.json`.
```sh
pnpm install
pnpm check                                # what CI runs
pnpm --filter @pochimail/desktop dev      # the app
POCHIMAIL_DEMO=1 pnpm --filter @pochimail/desktop dev   # fixture mailbox, no account
```

## Real accounts
Use your own OAuth clients in a git-ignored env file (names in [ADR 0007](docs/adr/0007-oauth-credentials-scopes.md)); never commit them.
- Google: Desktop OAuth client, Gmail API enabled, yourself as test user.
- Microsoft: public client app in Entra, redirect `http://127.0.0.1`.

## Workflow
1. Pick an issue from the repository's Issues tab (`good first issue` to start) and comment before working. No issue yet? Open one.
2. Post your plan in the issue (AGENTS.md rule 2).
3. Branch, code, run `pnpm check`, open a PR with the template.

Never put real email, addresses or secrets anywhere in the repository.

## License
AGPL-3.0. A DCO sign-off (`git commit -s`) is required once outside contributors arrive. Name, logo and mascot: [TRADEMARKS.md](TRADEMARKS.md). Security reports: [SECURITY.md](SECURITY.md).
