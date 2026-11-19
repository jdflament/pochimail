import { expect, it } from "vitest";
import { StorageError } from "./errors.ts";
import { andThen, err, mapResult, ok, type Result } from "./result.ts";

// Guards: forgetting the failure branch must not compile, and expected failures are values.
it("narrows exhaustively and carries typed errors without throwing", () => {
  const fetchPage = (): Result<number, StorageError> => err(new StorageError("disk full"));
  const result = andThen(
    mapResult(fetchPage(), (n) => n + 1),
    (n) => ok(String(n)),
  );
  if (result.ok) throw new Error("expected Err");
  expect(result.error.code).toBe("storage.failed");
  expect(result.error instanceof StorageError && result.error.message).toBe("disk full");
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
