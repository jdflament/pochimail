# @pochimail/cli

## Why this package exists
A developer tool, never shipped: runs the whole pipeline (sync → classify → signals → suggestions → apply → undo) on the fixture mailbox from a terminal, so domains and workflows can be exercised and debugged without Electron (ADR 0001).

## Owns
- The `pochi:run` command and its golden output.

## May import
`workflows`, `pipeline`, domain `./testing` exports, `@pochimail/testing`.

## Must not contain
- Anything the desktop app depends on.
- Logic that belongs in a domain or workflow.
