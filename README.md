<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/ui/src/assets/brand/lockup-light-text.svg">
    <img src="packages/ui/src/assets/brand/lockup-dark-text.svg" alt="Pochimail" width="420">
  </picture>
</p>

A private assistant for the email accounts you already have. It shows the big picture of your mailboxes, flags what matters, proposes cleanups and saves your important documents. **Your email never leaves your computer.**

Free and open source ([AGPL-3.0](LICENSE)). The assistant is **Pochi**, a small plush envelope (from *pochi-bukuro*, ポチ袋). Website: [getpochimail.com](https://getpochimail.com). Early development; no release yet.

Pochimail is **not a mail client**: any single email opens in your usual mail app. v1 supports Gmail and Outlook; other providers come in v1.1.

## The privacy promise
- **Your email stays on this computer.** There is no Pochimail server.
- **Local AI only.** Models run on your device and are downloaded once, checksummed.
- **No telemetry**, no crash reporting.
- **You decide.** Nothing changes without your approval unless you turn on Autopilot, which only does high-confidence, low-risk actions and tells you afterwards.
- **Nothing is deleted without your OK. Deleted emails go to the Trash, and you can undo.** Every batch is previewed and every action is logged.
- **No email content is stored**: only ids, dates, counts and what Pochimail did.

Security design, network allow-list and threat model: [docs/security.md](docs/security.md). Report vulnerabilities privately: [SECURITY.md](SECURITY.md).

## Documentation
[docs/product.md](docs/product.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [docs/design.md](docs/design.md) · [docs/adr/](docs/adr/) · [AGENTS.md](AGENTS.md) · [CONTRIBUTING.md](CONTRIBUTING.md)

## License and brand
Code: [AGPL-3.0](LICENSE). The name, logo, icon and mascot are not covered by it: see [TRADEMARKS.md](TRADEMARKS.md).
