import { z } from "zod";
import type { Transport } from "./transport.ts";

/** The browser channel needs only two methods; RPC teardown hooks are not part of it. */
type BrowserTransport = Pick<Transport, "post" | "onMessage">;

/**
 * The one host pair a sign-in page can live on (ADR 0007). The worker never loads these pages;
 * main only hands the URL to the user's system browser, and only for these hosts.
 */
const SIGN_IN_HOSTS = ["accounts.google.com", "login.microsoftonline.com"] as const;

/** `https` only, no port, no credentials: exactly a provider consent page. */
export const isSignInUrl = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    (SIGN_IN_HOSTS as readonly string[]).includes(url.hostname)
  );
};

const requestSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.literal("open-browser"),
  url: z.string(),
});
const responseSchema = z.object({
  id: z.number().int().nonnegative(),
  type: z.literal("open-browser"),
  ok: z.boolean(),
});

/**
 * Main side: opens a sign-in page in the system browser. Anything that is not a provider consent
 * URL is refused without touching the browser, so a compromised worker cannot launch arbitrary links.
 */
export const serveOpenBrowser = (
  transport: BrowserTransport,
  open: (url: string) => Promise<void>,
): void => {
  transport.onMessage((data) => {
    const request = requestSchema.safeParse(data);
    if (!request.success) return;
    const { id, url } = request.data;
    const answer = (opened: boolean): void =>
      transport.post({ id, type: "open-browser", ok: opened });
    if (!isSignInUrl(url)) {
      answer(false);
      return;
    }
    // Open exactly the string that was validated (`new URL` normalises case and escapes).
    open(new URL(url).href).then(
      () => answer(true),
      () => answer(false),
    );
  });
};

/** Worker side: asks main to open the consent page and settles when the browser was launched. */
export const createBrowserOpener = (
  transport: BrowserTransport,
  timeoutMs = 5000,
): ((url: string) => Promise<void>) => {
  let nextId = 0;
  const pending = new Map<number, (opened: boolean) => void>();
  transport.onMessage((data) => {
    const response = responseSchema.safeParse(data);
    if (!response.success) return;
    pending.get(response.data.id)?.(response.data.ok);
    pending.delete(response.data.id);
  });

  return (url: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("the system browser did not open"));
      }, timeoutMs);
      pending.set(id, (opened) => {
        clearTimeout(timer);
        pending.delete(id);
        if (opened) resolve();
        else reject(new Error("the system browser did not open"));
      });
      transport.post({ id, type: "open-browser", url });
    });
};
