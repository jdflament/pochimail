# @pochimail/ui

## Why this package exists
Shared package.
The design system in code, on shadcn/ui. Components render from props alone.

## Owns
- `styles/`: tokens (light and dark), the type, spacing and radius scale, named breakpoints, the Tailwind theme.
- `components/`: shadcn primitives (wrapped, not forked) and the composites in `docs/design.md` (ledger row, signal row, recommendation row, status strip, sheet, sidebar, mascot…).
- `i18n/`: message catalogs and locale formatting.
- `assets/`: fonts, brand, mascot (brand assets are not under the code license, see `TRADEMARKS.md`). `assets/brand/social/`: social images rendered from `app-icon-master.svg` on `#15171A`, key content in the centre 80%.

## May import
Its own files and its npm dependencies (Radix, CVA, Motion, sonner, lucide). Nothing from `@pochimail/*` (enforced: ui-is-presentational).

## Must not contain
- Domain types, IPC calls, data fetching or app state: pass plain props.
- Components not named in `docs/design.md` (screen-specific pieces live in the app's feature folder).
