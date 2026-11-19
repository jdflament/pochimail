import { InvalidCallback, SignInCancelled } from "@pochimail/core/errors";
import { expect, it } from "vitest";
import { openLoopbackReceiver } from "./loopback.ts";

const live = () => new AbortController().signal;

const open = async () => {
  const receiver = await openLoopbackReceiver();
  if (!receiver.ok) throw new Error("could not open the loopback listener");
  return receiver.value;
};

const isRefused = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch {
    return true;
  }
};

it("rejects a callback whose state does not match and closes the port (guards a code injected by another app)", async () => {
  const receiver = await open();
  const waiting = receiver.waitForCode({ state: "expected", signal: live(), timeoutMs: 5000 });
  const response = await fetch(`${receiver.redirectUri}?state=stolen&code=code_1`);
  expect(response.status).toBe(400);

  const result = await waiting;
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(InvalidCallback);
    expect(result.error.name).toBe("InvalidCallback");
    expect((result.error as InvalidCallback).reason).toBe("state-mismatch");
  }
  expect(await isRefused(receiver.redirectUri)).toBe(true);
  await receiver.close();
});

it("refuses a second callback and closes the listener after the first (guards a replayed redirect)", async () => {
  const receiver = await open();
  const waiting = receiver.waitForCode({ state: "s", signal: live(), timeoutMs: 5000 });
  const first = await fetch(`${receiver.redirectUri}?state=s&code=code_1`);
  expect(first.status).toBe(200);
  const result = await waiting;
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value).toBe("code_1");

  expect(await isRefused(`${receiver.redirectUri}?state=s&code=code_2`)).toBe(true);
  await receiver.close();
});

it("cancel returns SignInCancelled and frees the port (guards a listener left open after cancel)", async () => {
  const receiver = await open();
  const controller = new AbortController();
  const waiting = receiver.waitForCode({ state: "s", signal: controller.signal, timeoutMs: 5000 });
  controller.abort();
  const result = await waiting;
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(SignInCancelled);
  expect(await isRefused(receiver.redirectUri)).toBe(true);
  await receiver.close();
});

it("an unanswered callback times out after the configured window and frees the port (guards a hung sign-in)", async () => {
  const receiver = await open();
  const started = Date.now();
  const result = await receiver.waitForCode({ state: "s", signal: live(), timeoutMs: 25 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(SignInCancelled);
  expect(Date.now() - started).toBeLessThan(2000);
  expect(await isRefused(receiver.redirectUri)).toBe(true);
  await receiver.close();
});

it("a request for another path does not use up the one callback (guards a favicon request killing sign-in)", async () => {
  const receiver = await open();
  const waiting = receiver.waitForCode({ state: "s", signal: live(), timeoutMs: 5000 });
  const favicon = await fetch(new URL("/favicon.ico", receiver.redirectUri));
  expect(favicon.status).toBe(404);
  const callback = await fetch(`${receiver.redirectUri}?state=s&code=code_1`);
  expect(callback.status).toBe(200);
  const result = await waiting;
  expect(result.ok).toBe(true);
  await receiver.close();
});

it("a browser that answers before the flow starts waiting is not lost (guards a fast redirect)", async () => {
  const receiver = await open();
  const early = fetch(`${receiver.redirectUri}?state=s&code=code_early`);
  const result = await receiver.waitForCode({ state: "s", signal: live(), timeoutMs: 5000 });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value).toBe("code_early");
  await early;
  await receiver.close();
});

it("a provider refusal that is not a user cancel is rejected, not treated as success (guards consent errors)", async () => {
  const receiver = await open();
  const waiting = receiver.waitForCode({ state: "s", signal: live(), timeoutMs: 5000 });
  const response = await fetch(`${receiver.redirectUri}?state=s&error=server_error`);
  expect(response.status).toBe(400);
  const result = await waiting;
  expect(result.ok).toBe(false);
  if (!result.ok) expect((result.error as InvalidCallback).reason).toBe("provider-error");
  await receiver.close();
});
