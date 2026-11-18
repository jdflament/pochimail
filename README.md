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

Pochimail is an assistant that helps you tidy your mailboxes, keep what matters (newsletters, emails, attachments) and stay organized by setting things up for you, like tags and labels. Your email never leaves your computer.

It saves attachments to your own folder or drive, unsubscribes from useless newsletters, archives what you don't need, sorts and keeps what matters, and reminds you of what needs you.

Pochimail is free and open source ([AGPL-3.0](LICENSE)). The assistant is **Pochi**, a small plush envelope (from *pochi-bukuro*, ポチ袋). Website: [getpochimail.com](https://getpochimail.com).

> Status: early development. There is no release yet.

Pochimail is **not a mail client**: it sorts, summarizes, cleans and rescues. Any individual email opens in your usual mail app.

## The privacy promise
- **Your email stays on this computer.** Mail and analysis are processed and stored locally; saved files go to the folder or drive you choose. There is no Pochimail server.
- **Local AI only.** Models run on your device; nothing is sent to a cloud AI service. Models are downloaded once, checksummed.
- **No telemetry** and no crash reporting by default.
- **You decide.** Pochi proposes; nothing changes without your approval unless you turn on Autopilot, which only does high-confidence, low-risk actions and tells you afterwards.
- **Nothing is ever deleted.** Pochimail archives instead, never touches emails from real people without your approval, previews every batch, logs every action and lets you undo it.

## Short threat model
The full model will live in `docs/security/threat-model.md`. In short:
- **Assets**: the mailbox index, attachments, OAuth tokens and app passwords.
- **At rest**: the database is encrypted; its key and your sign-in tokens live in the operating system keychain, never in files or logs.
- **Untrusted input**: every email is hostile. Pochimail never runs or loads remote content, blocks remote images, never follows links in email bodies, and unsubscribes only through the standard one-click request or a `mailto:`. Attachments are hashed, saved only to your chosen folder or drive, and never opened automatically.
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
