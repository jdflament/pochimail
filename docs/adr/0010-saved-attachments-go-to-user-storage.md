# 0010 — Saved attachments go to user storage

Status: Accepted (2026-11-19)

## Context
A saved attachment is a document the user wants to keep, not mailbox data Pochimail owns. An encrypted blob store inside the app would duplicate the user's own storage.

## Decision
- Saved attachments are written to the user's own storage. Pochimail keeps only the destination, not the bytes or the name ([ADR 0014](0014-store-reports-and-actions-not-mail.md)); there is no blob store.
- The user chooses only **local or drive**. Pochimail picks a starting folder in that storage and tidies it.
- File naming is **one setting with a sensible default**: keep original names, or let Pochimail name and organize by date.
- A drive is a cloud-drive folder the user already has locally. Pochimail makes no new network call and adds no host.
- Saved files are the user's files: removing an account or deleting local data never deletes them.

## Consequences
The encrypted database holds no attachment bytes. A platform port chooses the folder and writes files. The blob-store mitigations of [ADR 0005](0005-local-storage.md) no longer apply.

## Alternatives considered
An encrypted content-addressed blob store (the old [ADR 0009](0009-store-metadata-not-mail.md) exception) · Pochimail-operated cloud storage (local-first, no backend).

## To verify
That saved files survive "remove account" and "delete all local data"; folder permissions and cloud-drive folders on three OSes.
