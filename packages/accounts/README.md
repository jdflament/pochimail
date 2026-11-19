# @pochimail/accounts

## Why this package exists
Domain package.
Connected mailboxes and their lifecycle, independent of how sign-in or storage works.

## Owns
- `Account` (provider, state, needs-reauth), connect, list, remove, mark needs reauth.
- Ports: provider sign-in, credential store, account repository. Events: account connected, removed, needs reauth.

## May import
`@pochimail/kernel`, `zod`.

## Must not contain
- Tokens or secrets in the model (they stay behind the credential store port), messages, classification.
