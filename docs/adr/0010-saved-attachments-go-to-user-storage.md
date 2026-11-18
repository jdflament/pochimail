# 0010 — Saved attachments go to user storage

Status: **Accepted (2026-11-19, maintainer decision)** · Brief: §4 Documents, §7 Saved attachments · Supersedes: the saved-document blob-store exception in [ADR 0009](0009-store-metadata-not-mail.md) · Related: [ADR 0005](0005-local-storage.md)

## Context
A saved attachment is a document the user wants to keep, not mailbox data Pochimail owns. Keeping it in an encrypted blob store inside Pochimail duplicates the user's own document storage and makes the app the keeper of the file. Decision (2026-11-19, confirmed): saved attachments are written to the user's own storage; keep the choice simple.

## Decision
- Saved attachments are written to the user's own storage, not kept inside Pochimail. Pochimail keeps only metadata/references locally (D11); no Pochimail blob store for saved documents.
- The user chooses only **local or drive**. Pochimail then picks a starting folder inside that storage and tidies everything there.
- File naming is the user's choice: keep original names, or let Pochimail name files smartly / organize by date. Keep it simple: **one setting, sensible default**.
- A drive is a cloud-drive folder the user already has locally; Pochimail makes no new outbound network call and adds no outbound host.
- Saved files are the user's files: removing an account or deleting Pochimail's local data does not delete them (brief §7 account flow).

## Consequences
- No attachment bytes at rest in Pochimail's encrypted store; the encrypted SQLite database keeps only metadata and references.
- Need a platform port for choosing local/drive and writing to the chosen folder, plus one naming setting (E6); default stays simple and reversible.
- The blob-store mitigations in ADR 0005 and the threat model no longer apply to saved attachments; other ADR 0009 rules stand.

## Alternatives considered
- Encrypted content-addressed blob store in Pochimail (former ADR 0009 exception): rejected for saved attachments; superseded by this decision.
- Pochimail-operated cloud storage: rejected; local-first and no backend.

## To verify
- One-setting UX with a sensible default, and that saved files survive "remove account" / "delete all local data" (E6).
- Folder permissions and cloud-drive folder behavior on macOS, Windows and Linux; no new network host.
