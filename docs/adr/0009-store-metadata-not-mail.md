# 0009 — Store metadata, not mail

Status: Accepted (2026-11-18, maintainer, plan D11) · Brief: §5.3, §5.10, offline behavior · Related: [ADR 0004](0004-incremental-sync-and-imap.md), [ADR 0005](0005-local-storage.md) · The saved-document exception below is superseded by [ADR 0010](0010-saved-attachments-go-to-user-storage.md) (Accepted 2026-11-19, maintainer decision).

## Context
Pochimail is not a mail client: opening and reading mail is the mail app's job. A full local copy of every message would put message text at rest, cost far more disk, and slow the first sync.

## Decision
- **Persisted**: message headers and metadata (provider ids, thread id, sender, recipient count, date, subject, labels/flags, size, `List-Unsubscribe` headers); derived data (category, reason, confidence, model/rules version, template hash, embedding, short capped snippet, extracted signals such as deadline or amount); sender aggregates; the action log and inverses; sync cursors; references to documents the user saved ([ADR 0010](0010-saved-attachments-go-to-user-storage.md)).
- **Never persisted**: full bodies and attachments. Bodies are fetched on demand and processed in memory only; there is no on-disk body cache.
- **Former exception (superseded by [ADR 0010](0010-saved-attachments-go-to-user-storage.md), Accepted 2026-11-19):** saving a document used to store that attachment in the encrypted blob store. Saved attachments now go to the user's own storage, not kept inside Pochimail; the user chooses local or drive, Pochimail picks a starting folder and tidies it, and file naming is one setting with a sensible default.
- **Search**: FTS5 indexes metadata and derived data only (sender, subject, snippet, category, signals). Full-text search across bodies stays v2, via embeddings.
- **Model updates**: re-derive from stored embeddings and snippets where possible; otherwise re-fetch bodies in the background within provider quotas.

## Consequences
- No message text at rest; about 1-2 KB per mail instead of a full copy; faster first sync.
- Offline shows everything Pochimail knows, but not full mail text (reading mail stays in the mail app).
- Re-classification after a model change may need background re-fetching, bounded by provider quotas.

## Alternatives considered
- Full local mirror (bodies and attachments): rejected for privacy, size and sync time.
- Encrypted on-disk body cache: rejected; still message text at rest.
