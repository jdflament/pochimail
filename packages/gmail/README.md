# @pochimail/gmail

## Why this package exists
Adapter package.
Gmail through the Gmail API, behind the mailbox and actions ports. Sign-in (OAuth PKCE) lives in `net`.

## Owns
- History sync (`messages.list` backfill, then `history.list`), metadata mapping to the minimal record, archive, labels, trash and untrash through `batchModify`, and live reads by id (`fetchBody`, `fetchDisplayFields`).

## May import
Domain packages (port types), `core` until the domains are split, `net`, `kernel`, `zod`.

## Must not contain
- Graph code, storage, business rules.
