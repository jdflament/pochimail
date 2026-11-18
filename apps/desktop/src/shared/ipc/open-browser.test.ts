import { expect, it } from "vitest";
import { createBrowserOpener, isSignInUrl, serveOpenBrowser } from "./open-browser.ts";

const connected = () => {
  let serve: (data: unknown) => void = () => undefined;
  let receive: (data: unknown) => void = () => undefined;
  const transportA = {
    post: (message: unknown) => receive(message),
    onMessage: (handler: (data: unknown) => void) => {
      serve = handler;
    },
  };
  const transportB = {
    post: (message: unknown) => serve(message),
    onMessage: (handler: (data: unknown) => void) => {
      receive = handler;
    },
  };
  return { transportA, transportB };
};

it("only provider consent URLs on https are accepted (guards a compromised worker opening arbitrary links)", () => {
  expect(isSignInUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=x")).toBe(true);
  expect(isSignInUrl("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")).toBe(true);
  expect(isSignInUrl("http://accounts.google.com/o/oauth2/v2/auth")).toBe(false);
  expect(isSignInUrl("https://accounts.google.com:8443/x")).toBe(false);
  expect(isSignInUrl("https://evil.example.com/?accounts.google.com")).toBe(false);
  expect(isSignInUrl("https://user:pass@accounts.google.com/")).toBe(false);
  expect(isSignInUrl("file:///etc/passwd")).toBe(false);
  expect(isSignInUrl("not a url")).toBe(false);
});

it("opens an accepted consent URL and reports success (guards a sign-in page that never opens)", async () => {
  const { transportA, transportB } = connected();
  const opened: string[] = [];
  serveOpenBrowser(transportA, async (url) => {
    opened.push(url);
  });
  const openBrowser = createBrowserOpener(transportB);
  await openBrowser("https://accounts.google.com/o/oauth2/v2/auth?state=s");
  expect(opened).toEqual(["https://accounts.google.com/o/oauth2/v2/auth?state=s"]);
});

it("refuses a non-provider URL without opening anything (guards the browser launching an unvetted link)", async () => {
  const { transportA, transportB } = connected();
  const opened: string[] = [];
  serveOpenBrowser(transportA, async (url) => {
    opened.push(url);
  });
  const openBrowser = createBrowserOpener(transportB);
  await expect(openBrowser("https://evil.example.com/sign-in")).rejects.toThrow();
  expect(opened).toEqual([]);
});

it("reports a browser that could not be opened instead of resolving silently (guards a dead sign-in spinner)", async () => {
  const { transportA, transportB } = connected();
  serveOpenBrowser(transportA, async () => {
    throw new Error("no browser");
  });
  await expect(
    createBrowserOpener(transportB)("https://accounts.google.com/o/oauth2/v2/auth"),
  ).rejects.toThrow();
});

it("gives up when main never answers (guards a worker waiting forever)", async () => {
  const { transportB } = connected();
  await expect(
    createBrowserOpener(transportB, 10)("https://accounts.google.com/o/oauth2/v2/auth"),
  ).rejects.toThrow();
});
