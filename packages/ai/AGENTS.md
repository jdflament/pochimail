# Local AI rules
- Local models only (ADR 0006); no network inference. Verify model files by SHA-256.
- Validate every model output with zod; when unsure, return low confidence so the email stays protected (ADR 0012).
- Every change reports eval precision and recall per type and signal in the PR (ADR 0016).
