# @pochimail/documents

## Why this package exists
Domain package.
Saving attachments where the user keeps files (ADR 0010).

## Owns
- `SavedDocument` (destination only), save and list use cases, deduplication by content hash.
- Ports: attachment source, document store. Events: document saved.

## May import
`@pochimail/kernel`, `zod`.

## Must not contain
- Attachment names or contents at rest in our database (ADR 0014).
