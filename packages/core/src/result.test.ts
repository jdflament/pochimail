import { type ProviderError, RateLimited } from "@pochimail/core/errors";
import { andThen, err, mapResult, ok, type Result } from "@pochimail/core/result";
import { expect, it } from "vitest";

// Guards: forgetting the failure branch must not compile, and expected failures are values.
it("narrows exhaustively and carries typed provider errors without throwing", () => {
  const fetchPage = (): Result<number, ProviderError> =>
    err(new RateLimited({ retryAfterMs: 500 }));
  const result = andThen(
    mapResult(fetchPage(), (n) => n + 1),
    (n) => ok(String(n)),
  );
  if (result.ok) throw new Error("expected Err");
  expect(result.error.code).toBe("provider.rate_limited");
  expect(result.error instanceof RateLimited && result.error.retryAfterMs).toBe(500);
  // @ts-expect-error `value` does not exist before narrowing on `ok`
  void result.value;
});

it("maps and chains Ok values", () => {
  expect(
    andThen(
      mapResult(ok(1), (n) => n + 1),
      (n) => ok(n * 10),
    ),
  ).toEqual(ok(20));
});
