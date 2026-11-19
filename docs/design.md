# Design system

Tokens live in `packages/ui/src/styles/` (`tokens.json` is the source, then `tokens.css`, `theme.css`). Reference screens are in `docs/design/screens/`; the light desktop ones are canonical, the rest show theme and layout only. A screen that differs from its reference is rejected.

## Direction
Calm, sober, editorial: screens read like a typeset document, not a dashboard of cards. Typography, hairline rules and open space structure the page. The mascot is the only warm element.
- Ledgers (rows, dotted leaders, tabular numbers), never stat tiles. Containers only where content needs one (summary sheet, list blocks).
- **Catch what matters**: people waiting on you, deadlines, things to remember. Old conversations never count as "waiting on you".
- **Clean up** is a list of recommendations ordered by impact, each a sentence ("Unsubscribe from 120 newsletters"), a one-line reason and one "Review" button. Space you can free by deleting is shown apart from email you can archive ([ADR 0012](adr/0012-delete-moves-to-trash-with-approval.md)). What the storage bar shows is **open for the maintainer**; do not invent a meaning.
- **Summary** is a plain sheet from Pochi over the current screen, never a page: "From Pochi · date", a title, one sentence, three figures, one next step, Keep it tidy choices. It shows only what is new. Bottom sheet on phones.
- **Saved attachments** go to the user's own storage ([ADR 0010](adr/0010-saved-attachments-go-to-user-storage.md)).
- **Review lists** (proposed, maintainer to confirm): Pochimail may label the concerned emails in the provider and open that filtered list in the user's mail app.
- Only categories that contain email are shown; once [ADR 0016](adr/0016-fixed-types-and-automatic-topics.md) is accepted, types and topics.

## Tokens
- Use the tokens as-is; never hard-code a color. Light and dark, text pairs at least 4.5:1, graphics at least 3:1.
- Values live in [tokens.json](../packages/ui/src/styles/tokens.json) (light and dark); do not copy them here.
- Color never codes content; type colors are reserved for rare charts, always with a label.
- Radius: 6, 10 (controls), 12 (buttons), 16 (cards, panels), pill. 4px spacing grid. Targets 32px, 36px sidebar items, 44px primary buttons.

## Typography
Two families only, self-hosted, upright (never an italic display serif): **Newsreader** for display, titles and figures, **Instrument Sans** for everything else. Japanese falls back to Hiragino Sans or Noto Sans JP. Tabular numbers for counts.

| Role | Size / weight |
|---|---|
| Display (Newsreader) | 40 / 450 |
| h1, one per screen (Newsreader) | 32 / 450 |
| Figure (Newsreader) | 34 / 450 |
| h2 | 17 / 600 |
| Body | 15 / 400 |
| UI | 14 / 500 |
| Caption | 13 / 400 |
| Overline, sidebar groups only | 12 / 600, uppercase |

## Responsive layout
The window is resizable, minimum 720×560. One markup, restyled by width, never separate mobile markup.
- 960px and up: full sidebar.
- 760–960px: sidebar becomes an icon rail (Overview, Documents, Activity, Settings, account switcher).
- Below 760px: frame goes edge to edge; the ledger drops its proportional bar.
- Below 560px (phone, companion): top bar, bottom tab bar, single column, summary as a bottom sheet.

## Components
shadcn/ui wrapped, not forked, in `packages/ui`: button, switch, checkbox and radio cards, pill radio group, recommendation, ledger and signal rows, status strip, speech bubble, account switcher, sidebar, sheet, empty state, sonner toast with Undo. Only these exist; screen-specific pieces live in the app.

## Interaction and accessibility
Real `button`, `a`, `input`, switch, checkbox and radio, reachable by keyboard with a visible `focus-visible`. One `h1` per screen, headings never skipped. Progress uses `role="status"` with `aria-live="polite"`. Never color alone. Copy survives French and Japanese expansion ("Archive 12,940"); ellipsis plus tooltip for long names.

## Anti-patterns
No cards inside cards, icon-tile stacks, numbered section labels, eyebrow chips, thin borders with wide shadows, beige "AI" palettes, pulsing dots, generic spinners (use skeletons and real progress), gradients, emoji.

## Motion
150ms press and hover, 220ms panels and toasts, easing `cubic-bezier(0.22, 1, 0.36, 1)`, pressed buttons scale to 0.98. No looping animation except Pochi's breathing. Timings live in `packages/ui/src/lib/motion.ts`, pinned by a test to `screens/source/Motion.dc.html`, the source of truth. Reduced motion and Settings › Animations off share one rule: instant opacity cross-fades, final values shown, mascot still. The system setting always wins.

## Motion catalog
| Moment | Motion |
|---|---|
| Live progress | Line glides (600ms); each finding slides up 8px and fades in |
| Numbers arrive | Count up once from 0 (600ms) |
| Storage settles | Open for the maintainer, tied to the storage bar; do not implement an invented meaning |
| Clean up, then undo | Row folds away (260ms); dark Undo toast for 5s; Undo unfolds the row |
| Pochi at rest | Breathing 1 → 1.012 wide / 1.025 tall (4.2s), blink (5.3s) |
| Pochi finds something | Squish, bounce up 14px, settle (620ms) |
| Summary arrives | Scrim fades, sheet slides in (about 250ms); no stamp, overshoot or rotation |
| Choices respond | Checkmark draws itself; switch thumb glides (150–220ms) |
| Screen to screen | Mascot stays; content slides in 16px (220–240ms) |
| Panels and menus | Fade and 4px scale-up from the trigger (220ms) |

## Writing
- "email/emails", never "mails". "Pochi" or "I" for the assistant. "Review" opens a list, "Undo" reverses, "View summary" opens the sheet. Screen titles are functional ("Overview"), never greetings.
- Always reassure about privacy and reversibility where data is read or changed. One primary action per state.
- Use `{device}` (Mac, PC, device), never "Mac". Realistic mock data, never placeholders like "[X]".
- Every empty, error, offline and update state, and every motion, is a feature with its own tests. Required states: sign-in cancelled, offline (a status line, never a pop-up), account needs reconnecting, model download failed (rules fallback), rate limit (auto-resume), empty list, update ready.

## Pochi
A soft plush felt envelope: puffy body, stitched flap seam, two glossy bead eyes, no mouth. Cream by default; charcoal for dark mode; stone and sage exist. Poses: default, happy, reading (glasses), saving (paperclip), sleepy, oops, night. Final art is a 3D render; the PNGs are placeholders behind a `Mascot` component with a `pose` prop.

Pochi mirrors the real app state through events, one pose at a time: curious at Welcome, patient while the browser sign-in runs, happy on success, calm when cancelled ("I didn't get access to anything"), reading while sorting, found on discoveries, happy at the summary and after a cleanup ("You can undo it anytime"), sleepy when paused or offline, oops on errors with one small shrink.

Animation is Rive (a state machine over layered renders) with a static PNG fallback. It plays only when visible, pauses on battery saver and when the window is hidden, and is static under reduced motion. Settings lets people turn Animations off or hide Pochi everywhere.
