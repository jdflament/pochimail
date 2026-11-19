# @pochimail/accounts

## Why this package exists
Domain package.
Connected mailboxes and their lifecycle, independent of how sign-in or storage works.

## Owns
- `Account`, connect, list, remove, mark needs reauth, and the account state events (`AccountConnected`, `AccountStateChanged`).
- Ports: credential store (`SecretStore`), OAuth token source and revoker, account repository, `AccountsUnitOfWork`.
- Sign-in errors, an in-memory adapter and contract suites under `./testing/*`.

## May import
`@pochimail/kernel`, `zod`.

## Must not contain
- Tokens or secrets in the model (they stay behind the credential store port), messages, classification.
