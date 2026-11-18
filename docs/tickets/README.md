# Tickets

Ticket files in this directory are the source of truth for planned and in-progress work.

## File format

Each ticket file is named `<ID>.md` (for example `M2-05.md`, `E4.md`). A ticket includes:

- **Read first**: the brief, ADR, and doc sections to read before starting.
- **Context**: why the work exists.
- **Scope**: what to build or change.
- **Acceptance criteria**: the checks that must pass for the ticket to be done.
- **Out of scope**: related work that belongs elsewhere.

`docs/tickets/m2-m4-lanes.md` records the M2/M4 dependency lanes and the resolved planning questions.

## Workflow

- **One ticket = one branch = one PR.**
- Branch name: `<type>/<id>-<slug>` (types: `feature`, `bug`, `chore`, `docs`). Example: `feat/m2-05-oauth-pkce`.
- **Blocked by** lists ticket IDs that must be finished before this one starts. Respect dependency order; independent tickets can run in parallel.
- The GitHub Project "Pochimail v1" tracks **M0/M1** items only. M2/M4 work is tracked by these ticket files, branches, and pull requests.
- When a pull request finishes a ticket, update [`docs/status.md`](../status.md) in the same PR (move the ticket to Done and record the PR number).
