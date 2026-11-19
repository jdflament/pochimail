# Renderer rules
@../../../../packages/ui/AGENTS.md

Read `packages/ui/AGENTS.md` first: its UI rules apply here too. In addition:
- `features/<name>/` never import each other; shared code goes to `lib/` or `packages/ui`.
- Data through TanStack Query fed by IPC events; filters in the router; long lists virtualized.
- Motion from `lib/motion.ts`, respecting reduced motion and the Animations setting.
