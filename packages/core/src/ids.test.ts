import { AccountId, MessageId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { expect, it } from "vitest";

declare function loadAccount(id: AccountId): void;

// Guards: ID mix-ups (a MessageId passed where an AccountId is expected) must fail typecheck.
it("rejects a MessageId where an AccountId is expected (type test)", () => {
  const message = unwrap(MessageId("m-1"));
  const account = unwrap(AccountId("a-1"));
  const never = () => {
    loadAccount(account);
    // @ts-expect-error MessageId is not assignable to AccountId
    loadAccount(message);
    // @ts-expect-error a plain string is not an AccountId
    loadAccount("a-1");
  };
  expect(never).toBeTypeOf("function");
});

// Guards: empty, padded or control-character IDs slipping into ports and log lines.
it.each(["", " a", "a ", "a\nb", "a\u0000b", "x".repeat(513)])("rejects invalid id %j", (raw) => {
  const result = AccountId(raw);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("domain.invalid_id");
});

it("rejects non-string input at runtime", () => {
  expect(AccountId(42).ok).toBe(false);
});

// Guards: over-strict validation rejecting real provider IDs (opaque, with symbols and unicode).
it.each(["a-1", "AAMkAGI2THVSAAA=", "<CAF+x=y@mail.example>", "é-ünï-1", "x".repeat(512)])(
  "accepts valid id %j and returns it unchanged",
  (raw) => {
    const result = MessageId(raw);
    expect(result.ok && result.value).toBe(raw);
  },
);
