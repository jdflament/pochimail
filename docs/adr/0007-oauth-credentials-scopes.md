# 0007 — OAuth, credentials and scopes

Status: Proposed · Brief: §4, §5.10 › Least-privilege, §7b › Account flow, §9 risks, §9b › Official builds · Research: M0-13

## Decision
- **Flow**: OAuth 2.0 authorization code + **PKCE** in the **system browser**, redirect to a **loopback** `http://127.0.0.1:<random port>` listener that closes after one request; `state` checked; cancel/timeout → "sign-in cancelled" state.
- **Client IDs** come from build-time config / env (`POCHIMAIL_GOOGLE_CLIENT_ID`…), never hard-coded. Official builds inject the verified IDs; forks and dev builds register their own (CONTRIBUTING.md).
- **Tokens**: refresh tokens and IMAP app passwords only in the OS keychain via the `SecretStore` port (safeStorage-encrypted); access tokens in memory only; never logged.
- **Scopes (least privilege, incremental)**:
  | Provider | Just look | Suggest / Autopilot | Opt-in only |
  |---|---|---|---|
  | Gmail | `gmail.readonly` | `gmail.modify` | `gmail.send` (mailto unsubscribe, P2); `https://mail.google.com/` (IDLE) |
  | Microsoft | `Mail.Read`, `offline_access`, `User.Read` | `Mail.ReadWrite` | `Mail.Send`; `IMAP.AccessAsUser.All` (IDLE) |
  | Yahoo (OAuth IMAP) | read scope | read/write scope | — (verify scopes) |
  | Other IMAP | app password (one credential, full access — explained honestly in the connect form) | | |
  Switching autonomy up re-prompts for the extra scope. Never a delete scope.
- **Remove account** revokes the token at the provider, deletes keychain entries and local data.
- **Reconnect** state when refresh fails; nothing else stops.
- **Verification track** (long lead, starts in M2): Google OAuth verification for restricted scopes (check whether CASA applies to a local-only app), Microsoft publisher verification, Yahoo developer approval. Test users until verified.

## Consequences
Copy "Pochimail never sees your password" is only true for OAuth providers; the IMAP app-password form needs its own wording (design issue).
