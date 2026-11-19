# Pipeline rules
- Bounded concurrency, batching, retries with backoff, cancellation.
- No domain knowledge: run the handlers `workflows` registers.
- Events go through the transactional outbox (ADR 0003).
