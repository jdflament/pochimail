# Mail adapter rules
- Delete moves to Trash; restore is the inverse (ADR 0012). Never request Gmail's full-access scope.
- Fetch display fields and unsubscribe headers live, by id, in batches; never persist them (ADR 0014).
- Test against recorded, scrubbed fixtures.
