# @pochimail/cleanup

## Why this package exists
Domain package.
Deciding what to propose: recommendations, protection (ADR 0012) and scan reports.

## Owns
- `Recommendation`, `ProtectionPolicy`, `ScanReport`, overview and summary read models, "useless" scoring.
- Ports: read access to classified records, report repository. Events: recommendations ready.

## May import
`@pochimail/kernel`, `zod`.

## Must not contain
- Applying actions (that is `actions`), provider or storage code.
