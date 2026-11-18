# Pochimail — product context

> App: Pochimail · Mascot/assistant: Pochi (from pochi-bukuro ポチ袋, the small Japanese gift envelope) · getpochimail.com. Read this before any design or product work (Impeccable reads `docs/product.md` too).

## One line
A private assistant that gives you the big picture of your email accounts, flags what needs you, clears the clutter and saves your documents. Everything runs on your Mac.

**Product definition (decided 2026-11-19):** Pochimail is an assistant that helps you tidy your mailboxes, keep what matters (newsletters, emails, attachments) and guides you to stay organized by setting things up for you, such as tags/labels in your mail provider.

## What Pochimail is, and is not
- **Is:** an overview and cleanup assistant for one or several existing accounts (Gmail, Outlook, Yahoo, iCloud, any IMAP mailbox).
- **Is not:** a mail client. People never read or write email in Pochimail. Any single email opens in their usual mail app.

## Users
Non-technical people with years of email across several accounts. They want to stop missing what matters, free space, find their documents, and trust that nothing is lost. Teams come later (handover when someone leaves).

## Jobs (what the user picks at setup, any combination)
1. **Catch what matters** — things to do and things to remember (reminders), not only replies: people waiting on you, threads waiting on others, deadlines, tasks/commitments, things to keep in mind. Signals weigh email dates: old conversations never count as "waiting on you" (D15).
2. **Declutter** — unsubscribe, archive old notifications, codes, shipping updates, promotions.
3. **Organize** — categories and topics applied as real labels (Gmail labels, Outlook categories); guide to organize: Pochimail proposes and, on approval, sets up tags/labels/folders in the provider (reversible, logged).
4. **Save documents** — find invoices, contracts, IDs, payslips… and write them to the user's own storage (decided 2026-11-19): the user chooses local or drive; Pochimail picks a starting folder there and tidies it. Naming is one setting: keep original names or let Pochimail name files smartly / organize by date (ADR 0010).

## Autonomy (one choice)
- **Just look** — read-only.
- **Suggest** (default) — prepares, the user approves each step.
- **Autopilot** — only high-confidence, low-risk actions, then a summary with undo.

Invariants in every mode: nothing is ever deleted; email from real people (People) is never touched without approval; every action is logged and undoable.

## Mail model
- **7 categories** (exactly one per email): People · Records · Purchases & travel · Sign-ins & security · Notifications · Newsletters · Promotions. *Suspicious* is a flag, not a category. Only categories that contain emails are shown.
- **Topics** (any number, user-editable): Job search, Work, Finance, Home, Health, Travel, Family, Projects…
- **Signals** (computed): Needs a reply · Waiting on them · Important sender · Has a document · Time-sensitive · Old and never opened.

## Principles
1. Local-first: no server, no cloud AI, no telemetry by default.
2. The assistant proposes, the user decides.
3. Safe by default: archive, never delete; preview; undo.
4. Never block the user: background work with live progress.
5. Privacy is the first message wherever data is processed.

## Voice
Pochi speaks in the first person, briefly and warmly: "Here's what I found", "I haven't changed anything yet". Plain language, no jargon. Always reassures about privacy and reversibility.
