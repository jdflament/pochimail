# Desktop rules
- Processes talk only through the typed contract in `src/shared`; `shared` imports no process.
- The preload exposes a fixed, tested list of methods. Adding one needs an issue.
- Never weaken Electron hardening (isolation, sandbox, CSP, blocked navigation, Fuses).
- Secrets only through the keychain. Never render remote content, follow links in email or open attachments.
- Platform code sits behind a port with one adapter per OS.
- `@pochimail/testing` only through the listed dev-only entries.
