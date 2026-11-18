# 0007 — OAuth, credentials and scopes

Status: Accepted (2026-11-17, maintainer, M0-15) · Brief: §4, §5.10 › Least-privilege, §7b › Account flow, §9 risks, §9b › Official builds · Research: M0-13

## Decision
- **Flow**: OAuth 2.0 authorization code + **PKCE** in the **system browser**, redirect to a **loopback** `http://127.0.0.1:<random port>` listener that closes after one request; `state` checked; cancel/timeout → "sign-in cancelled" state.
  No `id_token` is read (M2-05): `openid`/`email` are requested only to identify the account address, so there is no nonce to check; `state` plus PKCE protect the code.
- **Client IDs** come from build-time config / env (`POCHIMAIL_GOOGLE_CLIENT_ID`…), never hard-coded. Official builds inject the verified IDs; forks and dev builds register their own (CONTRIBUTING.md).
- **Tokens**: refresh tokens and IMAP app passwords only in the OS keychain via the `SecretStore` port (safeStorage-encrypted); access tokens in memory only; never logged.
- **Scopes (least privilege, incremental)**:
  | Provider | Just look | Suggest / Autopilot | Opt-in only |
  |---|---|---|---|
  | Gmail | `gmail.readonly` | `gmail.modify` | `gmail.send` (mailto unsubscribe, P2); `https://mail.google.com/` (IDLE) |
  | Microsoft | `Mail.Read`, `offline_access`, `User.Read` | `Mail.ReadWrite` | `Mail.Send`; `https://outlook.office.com/IMAP.AccessAsUser.All` (IDLE) |
  | Yahoo | app password (v1); OAuth `mail-r` if approved | `mail-w` (with `email mail-r`) if approved | — |
  | iCloud, other IMAP | app password (one credential, full access — explained honestly in the connect form) | | |
  Switching autonomy up re-prompts for the extra scope. Never a delete scope.
- **Remove account** revokes the token at the provider, deletes keychain entries and local data.
- **Reconnect** state when refresh fails; nothing else stops.
- **Verification track** (long lead, starts in M2): Google OAuth verification for restricted scopes (check whether CASA applies to a local-only app), Microsoft publisher verification, Yahoo developer approval. Unverified apps use listed test users only until verification passes. **Decided 2026-11-17:** Yahoo ships with an app password first (OAuth `mail-r`/`mail-w` only if Yahoo approves later); iCloud is app-specific password only; for Google CASA we ask Google in writing during verification (checklist G3), and if it applies we offer Gmail via IMAP app password first and fund the assessment only if the maintainer decides to; Gmail IMAP IDLE stays opt-in and may be dropped.

## Consequences
Copy "Pochimail never sees your password" is only true for OAuth providers; the IMAP app-password form needs its own wording (design issue).

## Research findings (M0-13, 2026-11-17)
Full sources, dates and the verification checklist: [docs/security/oauth-verification.md](../security/oauth-verification.md).
- **Google**: `gmail.readonly`, `gmail.modify` and `https://mail.google.com/` are **restricted**; `gmail.send` is only **sensitive**; `gmail.metadata` is restricted too, so it is no cheaper. Restricted-scope verification can take "several weeks".
- **CASA**: Google requires the annual security assessment for apps that store or transmit restricted data on servers, or can access it "from or through a third-party server". Nothing explicitly exempts or includes a local-only app. By the wording Pochimail (no backend) is not triggered, but this is **unconfirmed**: ask Google in writing during verification (checklist G3). Fallback if it applies: fund the assessment or offer Gmail via IMAP app password.
- **Microsoft**: publisher verification needs a Partner Program account (Partner One ID), an app registered in a **work/school Entra tenant** (not a personal account), and a DNS-verified publisher domain (`getpochimail.com`); free. Unverified multitenant apps can be blocked from user consent by step-up consent policy. Register as multitenant + personal accounts. IMAP scope is the full URL `https://outlook.office.com/IMAP.AccessAsUser.All`; OAuth IMAP works for Outlook.com and Microsoft 365.
- **Yahoo**: `mail-r`/`mail-w` are not self-serve; apply with evidence of policy compliance; no timeline, and no statement that new apps are accepted. **Decided (2026-11-17):** v1 ships Yahoo with an app password and adds OAuth only if approved. IMAP uses XOAUTH2 (OAUTHBEARER also supported).
- **iCloud**: **decided (2026-11-17)**: app-specific password only (needs two-factor). Apple's "authorize with Apple Account" flow has no public developer path.
- **Unverified apps** are limited to listed test users with a tester warning and a limited refresh-token lifetime (the 100-user and 7-day figures are not on the pages read).
- The verification track in the Decision section is unchanged in order but gains the explicit [checklist](../security/oauth-verification.md#6-verification-checklist-draft-issue-for-m2--m8); Yahoo request goes out early in M2.

## To verify (remaining, tracked in the M2/M8 checklist in [docs/security/oauth-verification.md](../security/oauth-verification.md#6-verification-checklist-draft-issue-for-m2--m8))
CASA answer from Google (G3); loopback/PKCE rules and unverified token lifetime (G5); consent behaviour of personal Outlook.com accounts for unverified apps (M4); Yahoo app-password path and approval status (Y1-Y3).
