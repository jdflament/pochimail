import { describe, it } from "vitest";

/** One named behaviour of a port. The name states the bug it prevents. */
export interface Check<H> {
  readonly name: string;
  run(harness: H): Promise<void>;
}

/** Shorthand so contract files read as a flat list of behaviours. */
export const check = <H>(name: string, run: (harness: H) => Promise<void>): Check<H> => ({
  name,
  run,
});

/**
 * Registers every check as a vitest test. `make` must return a fresh, empty harness each time,
 * so checks never share state.
 */
export function registerContract<H>(
  title: string,
  checks: readonly Check<H>[],
  make: () => H | Promise<H>,
): void {
  describe(title, () => {
    for (const c of checks) it(c.name, async () => c.run(await make()));
  });
}

/**
 * Runs the checks outside a test runner and returns the names of those that failed. This is how
 * a mutation test proves a deliberately broken adapter does not pass its contract.
 */
export async function failingChecks<H>(
  checks: readonly Check<H>[],
  make: () => H | Promise<H>,
): Promise<string[]> {
  const failed: string[] = [];
  for (const c of checks) {
    try {
      await c.run(await make());
    } catch {
      failed.push(c.name);
    }
  }
  return failed;
}
