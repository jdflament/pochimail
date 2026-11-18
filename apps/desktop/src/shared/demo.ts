export const DEMO_SEED = 20261117;
export type DemoScale = "small" | "full";

/**
 * Demo mode (dev and E2E only): `POCHIMAIL_DEMO=small|full` runs the app on the fixture mailbox with no real account.
 * Main passes the value to the worker and the model host and never in a packaged build. How `@pochimail/testing` ships
 * in a packaged build is still an open question for the maintainer; until it is answered this is the only way in.
 */
export const demoScale = (value: string | undefined): DemoScale | undefined =>
  value === "small" || value === "full" ? value : undefined;
