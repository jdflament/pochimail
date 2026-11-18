# Pochi — the Pochimail mascot

## Character
A soft **plush felt envelope**: puffy rounded body, fuzzy fabric texture, a stitched seam where the flap folds, two small glossy black pill-shaped bead eyes, **no mouth**. Calm, kind, a little shy. It is the only warm, playful element of the brand.

Colorways: **cream** (main), charcoal with white bead eyes (dark mode, night), stone, muted sage.
Poses: default · happy (closed eyes) · reading (round glasses, while sorting and in Documents) · saving (paperclip on top) · night.

## What's in this folder
`pochi-*.png` and `@2x` are **placeholders** drawn in code. They fix proportions, colors and poses. The final mascot must be a real 3D render.

## Producing the final renders
1. Explore with an image model using the prompt below, pick the strongest character.
2. Have a 3D artist model it (Blender) or build it in Spline from that reference, so poses stay consistent and you own the file.
3. Export each pose as transparent PNG/WebP at 256, 512, 1024 px, plus the animation assets below.

Prompt:
> 3D plush mascot character shaped like a soft puffy envelope, fuzzy felt fabric texture, stitched seam where the flap folds, two small black glossy bead eyes in a pill shape, no mouth, cream color, minimal and cute, soft studio lighting, subtle contact shadow, transparent background, high detail, editorial product photo style

Variants: replace "cream" with charcoal (white bead eyes), stone or sage; add "wearing small round black glasses" or "with a paperclip on top".

## Pochi's emotions, mapped to what it is doing
Pochi always reflects the real state of the app. One pose at a time, driven by domain events, never random.

| Moment | Pose / emotion | Motion | Words (examples) |
|---|---|---|---|
| Welcome | Default, curious | Idle breathing, blinks; eyes follow the cursor | "Clean up your email. Keep what matters." |
| Connect: waiting for the browser sign-in | Default, patient | Slow breathing, eyes glance toward the browser side | "Finish signing in in your browser." |
| Sign-in succeeded | Happy | Small squish-and-bounce | "You're connected." |
| Sign-in cancelled | Default, calm | Small shrink then settle | "No problem. I didn't get access to anything." |
| Setup: Just look selected | Reading (glasses) | Glasses slide on | "I'll only look around and show you what I find." |
| Setup: Suggest selected | Default | Nod (small vertical bob) | "Tell me what to help with…" |
| Setup: Autopilot selected | Happy (closed eyes) | Quick wiggle | "I'll take care of the obvious stuff and tell you." |
| Model downloading | Thinking (eyes up) | Slow sway | "Getting my brain ready. I'm already sorting with simple rules." |
| Sorting in the background | Reading (glasses) | Reading bob, eyes scanning | "Keep browsing, I'm on it." |
| Found documents / people waiting | Found | Squish, flap lifts | "Saved 412 documents." |
| Sorting finished / summary sheet | Happy | Small bounce, then rests in the plain sheet header | "Your mailbox, sorted." |
| Review: user applies a cleanup | Happy | Small nod per batch | "Done. You can undo it anytime." |
| Undo | Default | Quick rewind wiggle | "Put back." |
| Paused / offline / quiet hours | Sleepy (half-closed eyes) | Slower breathing | "I'll continue when you're back." |
| Error (reconnect, download failed) | Oops (eyes widen, small shrink) | One small shrink, no loop | "Gmail asked you to sign in again." |
| Empty category | Happy, relaxed | Idle | "This category is already tidy." |
| Update ready | Happy | One wave-like wiggle | "A new version is ready." |
| Night (dark mode, late hours) | Default (charcoal colorway optional) | Idle | — |

Settings › Appearance lets people turn **Animations** off (static poses only) or hide **Pochi** entirely; both are respected everywhere, as is the system "reduce motion" setting.

## Animation (recommended for v1)
**Tool: Rive** (rive.app). Interactive state machines, tiny runtime (WebAssembly, GPU-accelerated), works in Electron/React today and in React Native later. Build it from the 3D renders: body, flap, eyes and accessories as separate layers (2.5D), so motion stays light while looking rendered.

State machine:
| State | Motion | Trigger |
|---|---|---|
| Idle | Slow breathing squash (scale 1 → 1.012 wide / 1.025 tall, from the base, 4.2s loop), blink on a 5.3s loop | default |
| Looking | Eyes follow the cursor a few pixels; slight body lean | pointer near the mascot |
| Sorting | Glasses on, small reading bob, eyes scanning | scan in progress |
| Found | Quick squish-and-bounce, flap lifts a little | `DocumentSaved`, `ScanCompleted` |
| Happy | Eyes close into arcs, gentle wiggle | cleanup applied, summary opened |
| Thinking | Eyes look up, slow sway | waiting for a model result |
| Paused / sleepy | Eyes half closed, slower breathing | paused, offline, quiet hours |
| Oops | Small shrink, eyes widen | errors (paired with the error state copy) |

Rules:
- Subtle by default; never loops in a way that grabs attention, never blocks UI.
- Driven by domain events (inputs on the state machine), not timers in components.
- Plays only when visible; pauses on battery saver and when the window is hidden.
- `prefers-reduced-motion`: static pose swaps only, no movement.
- Fallback: static PNG for each pose (the same `Mascot` component with a `pose` prop).

Alternatives: short transparent video loops (HEVC with alpha on macOS, WebM VP9 alpha elsewhere) rendered straight from the 3D scene for the most realistic look but no interactivity; Lottie if the animator works in After Effects; Spline's realtime runtime for true 3D (heavier, use only for the welcome screen if at all).
