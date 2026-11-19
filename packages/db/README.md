# @pochimail/db

## Why this package exists
Adapter package.
One encrypted SQLite database implementing every domain's repository ports (ADR 0005, 0014).

## Owns
- Opening the database, migrations, one folder of repositories per domain, pruning.

## May import
Domain packages (port types), `kernel`, `logger`, `better-sqlite3-multiple-ciphers`.

## Must not contain
- Business rules; content fields forbidden by ADR 0014.
