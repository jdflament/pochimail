# Storage rules
- One folder per domain package (`src/<domain>/`), one repository per file; `src/database.ts` opens the encrypted file and runs migrations.
- Persist only the fields allowed by ADR 0014; the schema allow-list test must pass.
- Every schema change is a migration with a test. The key comes only from the secret store.
