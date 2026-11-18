<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/ui/src/assets/brand/lockup-light-text.svg">
    <img src="packages/ui/src/assets/brand/lockup-dark-text.svg" alt="Pochimail" width="420">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/pochimail/pochimail/actions/workflows/ci.yml"><img src="https://github.com/pochimail/pochimail/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

# Pochimail

A private assistant for the email accounts you already have. It shows you the big picture of your mailboxes, flags what matters, proposes cleanups and saves your important documents. **Your email never leaves your computer.**

Pochimail is free and open source ([AGPL-3.0](LICENSE)). The assistant is **Pochi**, a small plush envelope (from *pochi-bukuro*, ポチ袋). Website: [getpochimail.com](https://getpochimail.com).

> Status: early development. There is no release yet.

Pochimail is **not a mail client**: it sorts, summarizes, cleans and rescues. Any individual email opens in your usual mail app.

## The privacy promise
- **Your email stays on this computer.** Mail, analysis and your documents are processed and stored locally. There is no Pochimail server.
- **Local AI only.** Models run on your device; nothing is sent to a cloud AI service. Models are downloaded once, checksummed.
- **No telemetry** and no crash reporting by default.
- **You decide.** Pochi proposes; nothing changes without your approval unless you turn on Autopilot, which only does high-confidence, low-risk actions and tells you afterwards.
- **Nothing is ever deleted.** Pochimail archives instead, never touches emails from real people without your approval, previews every batch, logs every action and lets you undo it.

## Short threat model
The full model will live in `docs/security/threat-model.md`. In short:
- **Assets**: the mailbox index, attachments, OAuth tokens and app passwords.
- **At rest**: the database is encrypted; its key and your sign-in tokens live in the operating system keychain, never in files or logs.
- **Untrusted input**: every email is hostile. Pochimail never runs or loads remote content, blocks remote images, never follows links in email bodies, and unsubscribes only through the standard one-click request or a `mailto:`. Attachments are hashed and stored, never opened automatically.
- **Network**: Pochimail may only contact Google and Microsoft APIs, the mail servers of accounts you connected, GitHub Releases (updates) and the model download hosts (`huggingface.co` and `us.aws.cdn.hf.co`). Everything else is blocked.
  *(Plan P1, accepted: one exception, the standard one-click unsubscribe POST to the exact `List-Unsubscribe` URL of the sender, through one dedicated, logged path with no cookies and no redirects.)*
- **App hardening**: sandboxed renderer without Node access, narrow preload bridge, strict CSP, hardened Electron fuses.
- **Minimal permissions**: narrowest mail scopes per feature, never a delete scope.
- **Supply chain**: pinned lockfile, few dependencies, automated vulnerability checks, signed builds.
- **Out of scope**: an attacker with full control of your unlocked computer or your mail provider account.

Report vulnerabilities privately: see [SECURITY.md](SECURITY.md).

## Documentation
- [`docs/brief.md`](docs/brief.md): product and engineering brief (source of truth)
- [`docs/plan.md`](docs/plan.md): milestones and decisions · [`docs/adr/`](docs/adr/): architecture decisions
- [`AGENTS.md`](AGENTS.md): rules for contributors and agents · [`CONTRIBUTING.md`](CONTRIBUTING.md)

## License and brand
Code: [AGPL-3.0](LICENSE). The name, logo, icon and mascot are not covered by the code license: see [TRADEMARKS.md](TRADEMARKS.md).
