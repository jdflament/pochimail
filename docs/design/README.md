# Design material

App: **Pochimail** · Mascot and assistant: **Pochi** · Website: getpochimail.com

Design reference only. The build material (tokens, fonts, shadcn setup, brand, mascot) has been **moved** into the code (M0-02, `docs/brief.md` section 6); this folder keeps the reference screens and the full design-tool fonts.

| Path | What it is | Location |
|---|---|---|
| `../product.md` | Product context: users, jobs, modes, mail model, principles, voice | stays |
| `../design.md` | Design system: direction, type, colors, components, motion catalog, writing, anti-patterns, states | stays |
| `../mascot.md` | Pochi: character spec, emotions per app state, 3D render brief, Rive animation plan | stays |
| `screens/{light,dark}/` | Every screen at 2x: welcome, connect, setup, overview, summary sheet, states, settings (+ mascot sheet) | stays |
| `screens/{phone,narrow-window}/` | Phone width (390px @3x) and narrow desktop window (860px, icon rail) | stays |
| `screens/html/` | Static HTML/CSS of each screen with mock data: exact spacing, colors, copy (open in a browser) | stays |
| `screens/source/` | Original design-canvas files; motion keyframes and timing in `Motion.dc.html` | stays |
| `fonts/ttf/` | Full variable fonts for design tools (Figma, Sketch) | stays |
| tokens: `tokens.json` (W3C Design Tokens, source), `tokens.css` (shadcn variable names, light + `.dark`) | design tokens | `packages/ui/src/styles/` |
| shadcn setup: `package.json`, `tsconfig.json`, `components.json`, `src/lib/utils.ts` (`cn()`), `globals.css`, `theme.css` | `@pochimail/ui` | `packages/ui/` (+ `apps/desktop/components.json`) |
| fonts: `woff2/` (Newsreader + Instrument Sans, variable, latin + latin-ext), `OFL-*.txt` | self-hosted fonts with licenses | `packages/ui/src/fonts/` |
| app icon: `icon.icns`, `icon.ico`, `icon.png` (1024), `icons/NxN.png` (16 to 512) | electron-builder resources | `apps/desktop/build/` |
| tray icon: `trayTemplate.png` @1x/@2x, `tray-template.svg` (macOS template image) | menu-bar icon | `apps/desktop/resources/tray/` |
| logo lockups, wordmarks (SVG + PNG) and `app-icon-master.svg` | brand assets | `packages/ui/src/assets/brand/` |
| placeholder Pochi per pose (default, happy, reading, saving, night), @1x/@2x | mascot assets | `packages/ui/src/assets/mascot/` |

Brand and mascot folders (and `apps/desktop/build/`) carry a CC BY-NC-ND 4.0 `LICENSE`.

## shadcn/ui

Add components from the app; they land in `packages/ui/src/components` and imports become `@pochimail/ui/components/...`:

```
cd packages/ui && pnpm ui:add button switch checkbox radio-group dropdown-menu dialog tooltip sonner skeleton separator scroll-area
```

- `rsc: false`: Electron renderer, no React Server Components.
- `baseColor` only affects CLI defaults; colors come from `tokens.css`.
- Versions are pinned (the CLI is pinned in `packages/ui` `ui:add`); re-check https://ui.shadcn.com/docs/monorepo in case the schema changed.

## Notes
- The mascot PNGs and the mascot in the icon and lockups are placeholders with the right proportions and poses; the commissioned 3D Pochi replaces them (see `../mascot.md`).
- The plush mascot SVGs use filters (fur texture); they render in browsers and Electron. Use the PNGs in other tools.
- Brand assets (name, logo, icon, mascot) are not covered by the code license; see `../../TRADEMARKS.md`.
