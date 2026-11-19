# Mail adapter rules
- Delete moves to Trash; restore is the inverse (ADR 0012). Never request any scope beyond `Mail.ReadWrite` and `offline_access`.
- Fetch display fields and unsubscribe headers live, by id, in batches; never persist them (ADR 0014).
- Test against recorded, scrubbed fixtures.
