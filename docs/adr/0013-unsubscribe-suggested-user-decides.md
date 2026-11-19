# 0013 — Unsubscribe: suggested by Pochi, decided by the user

Status: Accepted (2026-11-19) · Related: [ADR 0012](0012-delete-moves-to-trash-with-approval.md)

## Context
Newsletters and promotions are the largest source of unwanted email. Unsubscribing cannot be undone, so the user must stay in control.

## Decision
- Pochi ranks senders as useless from local signals only (never or rarely opened, volume, age, the user's past corrections) and proposes batches ("Unsubscribe from 120 newsletters").
- The user confirms in Review, can untick senders, and can mark a sender **Keep**; Keep is remembered and never proposed again.
- Autopilot may unsubscribe only from senders above its confidence threshold that the user has never opened, and reports it afterwards.
- Mechanism: RFC 8058 one-click POST, sent only to the exact `List-Unsubscribe` URL through one dedicated, logged network path (no cookies, no redirects followed, listed in the allow-list); or `mailto:`, which is opt-in because it needs a send scope (`gmail.send`, `Mail.Send`) and otherwise opens the user's mail app with the draft prefilled. Never follow links in email bodies.
- After unsubscribing, Pochi may offer to archive or delete the sender's existing emails ([ADR 0012](0012-delete-moves-to-trash-with-approval.md)).
- The UI states before confirming that unsubscribing cannot be undone.

## Consequences
- Unsubscribe is the one action outside "everything is undoable", and the UI says so.

## Alternatives considered
- Fully automatic unsubscribe: rejected; irreversible actions need the user.
