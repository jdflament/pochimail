# @pochimail/mailbox

## Why this package exists
Domain package.
Knowing what is in each mailbox: incremental sync into the minimal message record of ADR 0014.

## Owns
- `MessageRecord` (ids, size, date, flags), sync cursors, incremental and full sync, live header fetch for display.
- Ports: mail reader (delta, headers), message and cursor repositories. Events: messages synced.

## May import
`@pochimail/kernel`, `zod`.

## Must not contain
- Classification, recommendations or actions; any persisted content field.
