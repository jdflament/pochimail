import { describe, expect, it } from "vitest";
import { DEFAULT_RETRY_POLICY, retryDelayMs } from "./retry.ts";

const policy = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 10_000 };

describe("retryDelayMs", () => {
  it("stays within [ceiling/2, ceiling] for any random value (guards retry storms and instant retries)", () => {
    for (const [attempt, ceiling] of [
      [1, 1_000],
      [2, 2_000],
      [3, 4_000],
      [4, 8_000],
      [5, 10_000],
      [30, 10_000],
    ] as const) {
      for (const r of [0, 0.25, 0.5, 0.999, 1]) {
        const d = retryDelayMs(attempt, policy, () => r);
        expect(d).toBeGreaterThanOrEqual(ceiling / 2);
        expect(d).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it("spreads retries: different random values give different delays (guards synchronized retries)", () => {
    expect(retryDelayMs(3, policy, () => 0)).not.toBe(retryDelayMs(3, policy, () => 1));
  });

  it("tolerates a misbehaving random source (guards NaN/negative delays)", () => {
    const d = retryDelayMs(2, DEFAULT_RETRY_POLICY, () => 7);
    expect(d).toBeLessThanOrEqual(2_000);
  });
});
