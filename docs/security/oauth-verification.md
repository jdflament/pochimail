# OAuth and provider verification: findings and checklist

Ticket M0-13 · Researched 2026-11-17 · Feeds ADR [0004](../adr/0004-incremental-sync-and-imap.md) and [0007](../adr/0007-oauth-credentials-scopes.md) · Consumed by M2 (accounts, scopes) and M8 (release, verification).

Provider pages change. Every claim below carries its source and the date it was read. "Page date" is the date shown on the page; most Google, Yahoo and Apple pages show none, so the read date is the only reliable one. Items marked **Unconfirmed** were not stated by a primary source and must be settled by the checklist, not assumed.

## 1. Google (Gmail API)

Sources (read 2026-11-17): [scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [verification requirements](https://support.google.com/cloud/answer/13464321).

| Scope | Class | Use in Pochimail |
|---|---|---|
| `gmail.readonly` | Restricted | "Just look" |
| `gmail.modify` | Restricted (does not allow permanent deletion) | Suggest / Autopilot (archive, labels) |
| `gmail.send` | **Sensitive** (not restricted) | Opt-in `mailto:` unsubscribe (P2) |
| `gmail.metadata` | Restricted | Not usable: no query/search and no body, and still restricted, so no gain |
| `https://mail.google.com/` | Restricted; Google says request it "only if your application needs to immediately and permanently delete" | Only for opt-in IMAP IDLE |

Consequences:
- **Restricted-scope verification is unavoidable** for readonly/modify, even if CASA does not apply. Google: it "can potentially take several weeks"; brand verification takes 2-3 business days.
- **CASA and local-only apps: Unconfirmed, probably not triggered.** Google's wording: "Every app that requests access to Google users' restricted data and has the ability to access data from or through a third-party server must go through a security assessment" and "If you store or transmit restricted scope data on servers". No page explicitly exempts an on-device-only app, and none lists local-only storage in the exceptions. Pochimail has no backend, so by the text the trigger is not met, but we need Google's answer in writing during verification (checklist G3). A Google Cloud community thread argues the opposite; it is a forum post, not policy. If CASA applies: annual re-assessment, third-party cost (vendor blogs quote USD 15k-75k, not a primary source). That would force a decision: drop restricted scopes for Gmail (not viable, archive needs `gmail.modify`) or fund it.
- **Mitigation if CASA applies:** the privacy relay is already rejected; fallback is IMAP with app password for Gmail (Google app passwords need 2FA), which carries no Google review but is less safe.
- **Testing mode** (unverified): only listed test users, tester warning screen, "a user cap is in effect, and the refresh token lifetime is limited." The numbers (100 users, 7-day refresh tokens) are not stated on the pages read; they are widely reported but **Unconfirmed**. Plan M2 development with short-lived tokens in mind.
- Personal-use exception: no verification if you are the only user or all users are personally known. Does not cover public releases.
- Loopback + PKCE for installed apps: not mentioned on the pages read (**Unconfirmed**, checklist G5; Google's installed-app guide must be read in M2).

### Quotas and batching
Source: [quota](https://developers.google.com/workspace/gmail/api/reference/quota), [batch](https://developers.google.com/workspace/gmail/api/guides/batch), [sync](https://developers.google.com/workspace/gmail/api/guides/sync), [batchModify](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchModify); read 2026-11-17. The quota page notes: "As of May 1, 2026, the usage limits for this API were updated"; projects created on or after that date get the new quotas.
- 1,200,000 units/min/project; **6,000 units/min/user**; 80,000,000 units/day/project is a billing threshold ("planned to incur charges ... later in 2026").
- Costs (units): `messages.get` 20 (60 for full/raw), `messages.list` 5, `messages.modify` 5, `messages.batchModify` 50, `history.list` 2, `threads.get` 40 (120 full), `messages.send` 100.
- Batch: max 100 calls, recommended <= 50; a batch of n counts as n calls (saves connections, not quota).
- `batchModify`: 1000 ids per request, 50 units.
- History: "typically available for at least one week and often longer", sometimes much shorter; a stale `historyId` gives HTTP 404 and requires a full sync (matches ADR 0004).
- Planning figure: 6,000 units/min/user is about 300 `messages.get` (metadata) per minute, so a first sync of 100k messages takes hours. The first-sync token bucket must budget in units, not requests. (Third-party sources quote 250 units/s per user and older 15,000/min figures; the primary page is authoritative.)

## 2. Microsoft (Graph, IMAP)

Sources (read 2026-11-17): [publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) (ms.date 2024-08-13, updated 2026-06-15), [throttling](https://learn.microsoft.com/en-us/graph/throttling-limits) (updated 2026-09-17), [JSON batching](https://learn.microsoft.com/en-us/graph/json-batching) (2025-02-21), [message delta](https://learn.microsoft.com/en-us/graph/delta-query-messages) (2025-08-06), [IMAP/SMTP OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth) (updated 2025-10-17).

- **Publisher verification** needs: a Partner One ID of a verified Microsoft AI Cloud Partner Program account (partner global account), the app registered in a **work or school Entra tenant** ("Apps that are registered by using a Microsoft account can't be publisher verified"), a publisher domain that is not `*.onmicrosoft.com` and matches the CPP email domain (plan: a DNS-verified `getpochimail.com`), admin roles on both sides with MFA. No charge. Result: a blue verified badge on the consent prompt.
- **Why it matters:** for multitenant apps registered after 2020-11-08 requesting more than basic sign-in, risk-based step-up consent can stop users from consenting when the app is unverified. Impact on personal Outlook.com accounts: the page says nothing; treat as **Unconfirmed** and test with a personal account on an unverified registration in M2.
- **Account types:** register as multitenant + personal accounts so Outlook.com and Microsoft 365 both work.
- **Scopes:** Graph `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access` (as in ADR 0007). IMAP scope strings are full URLs: `https://outlook.office.com/IMAP.AccessAsUser.All` (and `.../SMTP.Send`). IMAP OAuth is supported for both Microsoft 365 and Outlook.com. The page does not say whether tenants have IMAP disabled by default (**Unconfirmed**; handled by graceful fallback as in ADR 0004).
- **Limits (Outlook, per app ID and mailbox):** 10,000 requests per 10 min, 4 concurrent requests, 150 MB upload per 5 min. **Unconfirmed wording**: obtained through a summarised extraction of the page, not verbatim. Re-read verbatim in M2 before coding limits. `$batch`: "limited to 20 individual requests"; each sub-request is throttled individually (429 per item). Throttled requests: HTTP 429 + `Retry-After`.
- **Delta:** per folder; `$filter` only `receivedDateTime ge/gt`, max 5,000 messages; tokens opaque, **no expiry stated** on the page, so treat as expiring and fall back to a full folder walk (ADR 0004 already does this for Gmail).

## 3. Yahoo (IMAP with OAuth)

Sources (read 2026-11-17): [documentation](https://senders.yahooinc.com/developer/documentation/), [developer access](https://senders.yahooinc.com/developer/developer-access/), [OAuth guide](https://developer.yahoo.com/oauth2/guide/). No page shows an update date (footer "© 2026 Yahoo").
- Scopes `mail-r` (read) and `mail-w` (write), listed in the YDN app profile once approved. They are "not available for self-served setup in the developer console": third parties "have to apply for access and provide evidence that they are honoring our policies and guidelines" through a developer-access form. No review timeline, and **nothing says whether new applications are currently accepted**. Policy forbids transferring or selling the data; Yahoo "may revoke access ... at any time".
- The page documents SASL OAUTHBEARER for IMAP (sample capability `AUTH=PLAIN AUTH=OAUTHBEARER`) and XOAUTH2 for SMTP (`XOAUTH2 OAUTHBEARER`); the sections are inconsistent. Treat as **XOAUTH2 (OAUTHBEARER also supported)**, matching brief §1/§5.3; confirm which mechanism Yahoo's IMAP accepts with `imapflow` (checklist Y3).
- Third-party sources (Nylas) say the process includes a Commercial Access Agreement and that read-write is requested as `email mail-r mail-w` together. **Unconfirmed** by primary pages.
- Pages do not describe Yahoo app passwords. They exist in practice (account security setting) but this was **not verified here**.
- Decision input: Yahoo OAuth is a long-lead, uncertain approval. v1 ships Yahoo through **app password first**, OAuth only if approval is granted (see ADR 0007).

## 4. iCloud
Sources (read 2026-11-17): Apple [app-specific passwords](https://support.apple.com/en-us/102654) (published 2025-10-08), [iCloud Mail server settings](https://support.apple.com/en-us/102525) (2026-02-03), [authorize with Apple Account](https://support.apple.com/en-us/121539) (2025-10-07).
- Server: `imap.mail.me.com:993` (SSL), `smtp.mail.me.com:587`; username is the mail name without the domain (full address as fallback); no POP.
- App-specific password requires two-factor on the Apple Account; up to 25 active; all revoked if the main password changes.
- Apple describes authorizing "supported third-party apps" with the Apple Account ("click Allow"), without naming OAuth, XOAUTH2 or OAUTHBEARER, and without listing supported apps. No public developer registration path was found. Decision: **app password only for iCloud in v1**; do not build for the Apple Account flow.

## 5. ISPDB (Thunderbird autoconfig)
Sources (read 2026-11-17): [thunderbird/autoconfig](https://github.com/thunderbird/autoconfig), [LICENSE](https://raw.githubusercontent.com/thunderbird/autoconfig/master/LICENSE), [wiki](https://wiki.mozilla.org/Thunderbird/ISPDB) (last edited 2015-11-11, marked outdated).
- The repository is **MPL-2.0**; neither README nor LICENSE states a separate licence for the data files in `ispdb/`, and the `ispdb/` directory itself and the MDN autoconfiguration page were not read. MPL-2.0 is file-level copyleft: bundling unmodified or modified ISPDB XML files means those files stay under MPL-2.0 with a notice of where the source is. This is compatible with shipping inside an AGPL-3.0 app as separate data files, but confirm.
- Decision: bundle only the few provider presets we support (Yahoo, iCloud, Fastmail, GMX, Zoho, AOL), keep each copied file under its original header, add a `THIRD_PARTY_NOTICES` entry. Prefer re-typing host/port facts (not copyrightable facts) for presets we hand-write; use the files only for the long tail. Final call at M2 after reading `ispdb/` headers (checklist I1).

## 6. Verification checklist (draft issue for M2 / M8)

Draft title: **Provider OAuth verification and policy checks** · `type:docs` `area:mail` `p0` · blocked by: M2 account design · milestone: starts M2, closes M8. Not created on GitHub (the coordinator decides).

### Google
- [ ] G1. Create the Google Cloud project, consent screen (brand: name, logo, domain `getpochimail.com`, privacy policy, homepage). Domain verified in Search Console.
- [ ] G2. Request scopes per autonomy level, incrementally: `gmail.readonly`, then `gmail.modify`; `gmail.send` and `https://mail.google.com/` stay opt-in and are submitted separately only if the feature ships.
- [ ] G3. **Ask Google in the verification thread, in writing, whether CASA applies to an app with no server that processes Gmail data only on the user's device.** Save the answer in this file with the date. If yes: decide fund / IMAP-app-password fallback and update ADR 0007.
- [ ] G4. Limited Use compliance statement, demo video of the scope usage, privacy policy that states local-only processing and no transfer.
- [ ] G5. Read Google's installed-app (loopback + PKCE) guide; confirm the redirect and PKCE rules; confirm the unverified-app refresh-token lifetime and user cap numbers.
- [ ] G6. Confirm whether IMAP IDLE via `https://mail.google.com/` is acceptable for an opt-in setting; if not, drop it (polling only).
- [ ] G7. Re-read the quota page; implement the token bucket in quota units (messages.get 20, batchModify 50); verify the post-2026-05-01 per-user number for the project's actual creation date.
- [ ] G8. Calendar the annual re-verification (if CASA: every 12 months from the LOA date).

### Microsoft
- [ ] M1. Enrol a Microsoft AI Cloud Partner Program account (partner global account), get the Partner One ID; confirm no fee at that time.
- [ ] M2. Register the app in a **work or school** Entra tenant (not a personal Microsoft account), multitenant + personal accounts; set a publisher domain on `getpochimail.com` (DNS-verified).
- [ ] M3. Complete publisher verification; confirm the verified badge on the consent prompt.
- [ ] M4. Test consent with (a) personal Outlook.com, (b) a Microsoft 365 tenant with default consent policy, before and after verification; record what blocks.
- [ ] M5. Re-read verbatim the Outlook throttling limits (10,000 / 10 min, 4 concurrent, 150 MB / 5 min) and encode them; honour `Retry-After`; `$batch` size 20.
- [ ] M6. Measure the message delta token lifetime empirically; confirm full-resync fallback.
- [ ] M7. Check whether IMAP is disabled by default on test tenants and that the opt-in IDLE falls back cleanly.

### Yahoo
- [ ] Y1. Submit the Yahoo developer access request (mail-r/mail-w) early in M2; record the date and answer; ask whether new apps are accepted and the expected timeline.
- [ ] Y2. Until approved, ship Yahoo with an app password; verify the app-password path with a real test account (not documented on the pages read).
- [ ] Y3. If approved: confirm XOAUTH2 vs OAUTHBEARER against `imapflow` and Yahoo's servers; confirm refresh-token behaviour.

### iCloud
- [ ] I0. Verify app-specific password login against `imap.mail.me.com` with `imapflow` using a test account; confirm the username format; connect form explains two-factor and how to generate the password.
- [ ] I1. (ISPDB) Read the `ispdb/` file headers and the MDN autoconfig page; settle the licence for bundled presets; add `THIRD_PARTY_NOTICES`.

### Cross-cutting
- [ ] X1. OAuth client IDs injected from env/config in official builds only; fork instructions in `CONTRIBUTING.md` (AGENTS.md section 6).
- [ ] X2. Add each verified date and answer to this file; update ADRs 0004 and 0007 if any answer changes a decision.
- [ ] X3. Network allowlist (M0-16 `network.md`) lists the OAuth token and revocation hosts per provider.

## 7. Source quality notes
- Primary pages were read through a fetch tool that summarises pages; quotes are reproduced from its report and should be spot-checked when each item is acted on. The Outlook throttling numbers specifically came from a model-extracted summary rather than verbatim text.
- Search results about CASA, quotas and Yahoo process are mostly vendor blogs; they are cited only as pointers and never used as the basis of a decision.
