# @pochimail/mail

## Why this package exists
Transitional. It holds the OAuth sign-in and the network allow-list until they move to `net`, `gmail` and `graph` (ADR 0015); then it is deleted.

## Owns
- `egress/`: allow-listed HTTP client, rate limiting, host policy.
- `oauth/`: PKCE loopback sign-in, token refresh and revocation.

## May import
`core` and `kernel` ports, `logger`, and its own files (enforced: legacy-adapters-depend-on-core-only).

## Must not contain
- Business rules, UI or storage.
- IMAP code: IMAP returns in v1.1 (ADR 0011).
