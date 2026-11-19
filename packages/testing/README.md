# @pochimail/testing

## Why this package exists
Shared package.
Shared test data that never ships: the seeded fixture mailbox (also the eval set), recorded provider fixtures and the eval harness. In-memory adapters and contract suites live in each domain's `./testing` export.

## Owns
- The fixture mailbox generator and the eval harness (precision/recall gates).
- Recorded HTTP fixtures and the scrub check; a fake OAuth server.

## May import
Domain packages (types), `kernel`, `zod`, test runtimes.

## Must not contain
- Production code paths: if shipped code needs something here, it is in the wrong package.
- Real mail, addresses or secrets (use the mock dataset).
- Harnesses for providers or features that are not in v1 scope.
