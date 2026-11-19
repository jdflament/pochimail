# @pochimail/workflows

## Why this package exists
Shared package.
The only place domains meet: it turns one domain's events into another's commands, so domains stay independent.

## Owns
- Scan (sync → classify → recommend), apply (action applied → refresh reports), notifications on completion.

## May import
Domain packages, `kernel`, `logger`. Tests use the domains' `./testing` exports.

## Must not contain
- Business rules, adapters, UI.
