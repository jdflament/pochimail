/**
 * Motion catalog timings (docs/design/screens/source/Motion.dc.html is the source of truth; docs/design.md › Motion catalog).
 * motion.test.ts fails when a value here stops matching that file. One easing everywhere; nothing loops except Pochi's idle breathing.
 */
export const MOTION = {
  /** Press, hover, checkbox ring, small feedback. */
  pressMs: 150,
  /** Panels, menus, steps, finding text, toasts. */
  panelMs: 220,
  /** Screen-to-screen slide. */
  screenMs: 220,
  /** Summary sheet enter: scrim fade + slide. */
  sheetMs: 250,
  /** Progress line glide. */
  progressMs: 600,
  /** Numbers roll up once. */
  countUpMs: 600,
  /** Storage bar settle: keep segment, then cleanable segment after a delay. */
  storageBarMs: 700,
  storageBarHatchedDelayMs: 140,
  /** Cleanup row fold (height) and its fade. */
  rowFoldMs: 260,
  rowFadeMs: 200,
  /** Undo toast rise. */
  toastMs: 220,
  /** Switch thumb glide. */
  switchMs: 180,
  /** Pochi. */
  mascotBreathingMs: 4200,
  mascotBlinkMs: 5300,
  mascotFoundMs: 620,
} as const;

export const MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Same curve as a function (1 − (1 − k)³), for JS-driven numbers. */
export const easeOutCubic = (k: number) => 1 - (1 - k) ** 3;
