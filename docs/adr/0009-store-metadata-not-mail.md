# 0009 — Store metadata, not mail

Status: Superseded by [0014](0014-store-reports-and-actions-not-mail.md)

## Context
Pochimail is not a mail client. A full local copy of every message would put message text at rest, cost disk and slow the first sync.

## Decision
- Persisted: message headers and metadata (ids, sender, date, subject, labels, size, `List-Unsubscribe`); derived data (category, reason, confidence, version, template hash, embedding, capped snippet, signals); sender aggregates; the action log; sync cursors; references to saved documents.
- Never persisted: full bodies and attachments. Bodies are fetched on demand and processed in memory, with no on-disk cache.
- Search: FTS5 over metadata and derived data only; full-text search across bodies stays v2.
- After a model update, re-derive from stored embeddings and snippets where possible, otherwise re-fetch within provider quotas.

## Consequences
No message text at rest, about 1–2 KB per email, a faster first sync. [ADR 0014](0014-store-reports-and-actions-not-mail.md) later removed subjects, snippets, embeddings and the full-text index too.

## Alternatives considered
A full local mirror, or an encrypted body cache: rejected for privacy, size and sync time.
