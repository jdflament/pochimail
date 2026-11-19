# Workflow rules
- A workflow reacts to one domain's event and calls other domains' use cases. Nothing else lives here.
- No business rules: if a workflow decides something, that decision belongs in a domain policy.
- Each workflow is idempotent and tested with the domains' in-memory adapters.
