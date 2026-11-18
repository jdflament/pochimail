# Pochimail — design system

Source of truth for visual and interaction decisions. Tokens live in `packages/ui/src/styles/` (`tokens.json` source, `tokens.css`, `theme.css`). Screens in `docs/design/screens/` are the reference for layout.

## Direction
Modern, calm and sober, with an **editorial signature**: screens read like a well-typeset document written by someone, not a dashboard of cards. Typography, hairline rules and open space do the structuring. The mascot is the only warm, playful element.

- Data is shown as **ledgers** (rows with dotted leaders, tabular numbers), not stat tiles.
- **Clean up = recommendations** (macOS Storage pattern): headline figure, one monochrome storage bar (solid = keep, hatched = can be cleaned), then sentences ordered by impact with reason, size and one "Review" button. No color coding in content.
- Containers only where content needs one (the summary sheet, list blocks). No cards inside cards.
- Summaries are a **plain sheet from Pochi over the current screen** (never a separate page), built on the existing Dialog/Sheet primitives: small Pochi icon + "From Pochi · date", title, one sentence, three figures, one next step, Keep it tidy choices. Show only what is new; the Overview holds the details. Bottom sheet on phones.

## Typography
| Role | Font | Size / weight | Use |
|---|---|---|---|
| Display | Newsreader | 40px / 450, -0.02em | Welcome, summary title |
| Title (h1) | Newsreader | 32px / 450, -0.02em | Every screen title |
| Figure | Newsreader | 34px / 450 | Large numbers in ledgers |
| Section (h2) | Instrument Sans | 17px / 600 | Every section title |
| Body | Instrument Sans | 15px / 400, 1.5 | Paragraphs |
| UI | Instrument Sans | 14px / 500 | Buttons, list items |
| Caption | Instrument Sans | 13px / 400 | Secondary info |
| Overline | Instrument Sans | 12px / 600, +0.06em, uppercase | Sidebar group labels only |

Rules: one h1 per screen, then h2s, never skipped. Upright serif only (never italic display). Two families maximum. Tabular numbers for counts. Fonts are self-hosted (`packages/ui/src/fonts/`), never loaded from Google at runtime. Japanese falls back to Hiragino Sans / Noto Sans JP.

## Color
Light (default) and dark themes, all text pairs ≥ 4.5:1, graphic elements ≥ 3:1. See `packages/ui/src/styles/tokens.css`.

| Token | Light | Dark |
|---|---|---|
| background | #F3F4F5 | #121315 |
| surface | #FFFFFF | #1A1C1F |
| sidebar | #EEF0F2 | #16181A |
| muted | #EDEFF1 | #24272B |
| border | #E3E5E8 | #2A2D32 |
| text | #15171A | #EEF0F2 |
| text secondary | #5C6169 | #A4A9B0 |
| text tertiary | #686D75 | #8C9199 |
| primary (button) | #15171A / white text | #EEF0F2 / #121315 text |

Category colors (reserved for rare charts; screens use monochrome icons, never color coding): People #4E6A8A · Records #8A6A4E · Purchases & travel #B07820 · Sign-ins & security #7C7F86 · Notifications #5A817B · Newsletters #C04F72 · Promotions #9C6E95 (dark variants in tokens). Always paired with a label.

## Shape and space
Radius: 6 (small), 10 (controls), 12 (buttons), 16 (cards/panels), pill. Spacing on a 4px grid (8, 12, 16, 20, 24, 32, 40, 48). Targets: 32px minimum, 36px sidebar items, 44px primary buttons.

## Components (shadcn/ui in `packages/ui`)
Button (primary charcoal, secondary outline, ghost), Switch, Checkbox card, Radio card, Pill radio group, Recommendation row (sentence, reason, size, Review), Storage bar (solid/hatched), Ledger row (label, leader, count, size), Signal row (big figure + text + Review), Status strip (2px progress + status line), Speech bubble (mascot), Account switcher, Sidebar item, Empty/error state, sonner toast + action. Follow shadcn conventions (CVA variants, `data-slot`, `asChild`, focus-visible) and composition over boolean props.

## Motion
150ms press/hover, 220ms panels and toasts, ease-out `cubic-bezier(0.22, 1, 0.36, 1)`. Pressed buttons scale to 0.98. Numbers count up when results arrive (600ms). No looping or pulsing UI animation. Everything respects `prefers-reduced-motion`.

## Motion catalog (see the "Motion & transitions" board on the canvas)
| Moment | Motion | Timing |
|---|---|---|
| Live progress | Progress line glides; each new finding slides up 8px and fades in, replacing the previous one | 600ms width, 220ms text |
| Numbers arrive | Counts roll up once from 0 when results land, then stay still | 600ms, ease-out cubic |
| Storage settles | Bar fills once: keep segment, then the hatched cleanable segment; after a cleanup the hatched part shrinks | 700ms, +140ms |
| Clean up, then undo | Row folds away (height + fade) instead of vanishing; dark undo toast rises from below for 5s; Undo unfolds the row | 260ms fold, 220ms toast |
| Pochi at rest | Slow breathing (scale 1 → 1.012 wide / 1.025 tall, from the base) and blinks | 4.2s breathing loop, 5.3s blink loop |
| Pochi finds something | Squish, bounce up 14px, settle | 620ms |
| Summary arrives | Standard sheet enter: scrim fades in and the plain sheet slides in over the Overview; no stamp landing, overshoot or rotation | ~250ms, one easing (`cubic-bezier(0.22, 1, 0.36, 1)`) |
| Choices respond | Checkmark draws itself; ring and background cross-fade; switch thumb glides | 150–220ms |
| Screen to screen | Mascot stays; content slides in 16px from the right; step indicator stretches to the active step | 220–240ms |
| Panels and menus | Fade + 4px scale-up from the trigger | 220ms |

Never animate: layout jumps, decorative loops, pulsing indicators, skeleton shimmer longer than needed. With `prefers-reduced-motion`, every motion becomes an instant cross-fade and the mascot holds still.

## Writing
- Device name is dynamic: use `{device}` (Mac / PC / device) in every string, e.g. "Sorting privately on this {device}". Designs show "Mac" because macOS ships first.
- Use realistic mock data in designs and fixtures, never placeholder tokens.
- "email / emails", never "mails". "Pochi" or "I" for the assistant.
- Screen titles are functional ("Overview", "Newsletters"), never greetings.
- Short action labels that survive French/Japanese expansion ("Archive 12,940", "Unsubscribe 120").
- "Review" opens a list, "Undo" reverses, "View summary" opens the summary sheet.
- Every state (error, empty, offline, update) has one primary action and plain words.

## Anti-patterns (Impeccable checklist)
No cards inside cards, icon-tile stacks, numbered section labels, eyebrow chips, thin borders with wide shadows, beige "AI" palettes, pulsing dots, generic spinners, gradients in UI, emoji.

## Required states
Sign-in cancelled · Offline (paused, resumes) · Account needs reconnecting · Model download failed (rules fallback) · Provider rate limit (auto-resume) · Empty category · Update ready (restart now / what's new). See `screens/06-states.png`.
