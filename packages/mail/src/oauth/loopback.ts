import { createServer, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { InvalidCallback, ProviderFailed, SignInCancelled } from "@pochimail/core/errors";
import type { AsyncResult, CancelSignal } from "@pochimail/core/ports/common";
import { err, ok, type Result } from "@pochimail/core/result";

/** The one path the provider may redirect to; anything else on the port is ignored. */
export const CALLBACK_PATH = "/callback";
/** ADR 0007: a sign-in that is not answered in five minutes is cancelled. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
/** How long a still-open socket may delay `close()` before it is destroyed (a stuck local client). */
const CLOSE_GRACE_MS = 250;

export type LoopbackFailure = SignInCancelled | InvalidCallback;

export interface WaitForCodeOptions {
  readonly state: string;
  readonly signal: CancelSignal;
  /** Defaults to `SIGN_IN_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
}

export interface LoopbackReceiver {
  /** Exactly `http://127.0.0.1:<random port>/callback`; the user's browser follows the redirect here. */
  readonly redirectUri: string;
  /**
   * Resolves with the authorization code of the first valid callback. A wrong `state` or a second
   * callback fails and closes the listener; cancel and timeout return `SignInCancelled` and free
   * the port. The listener never accepts another request afterwards.
   */
  waitForCode(options: WaitForCodeOptions): Promise<Result<string, LoopbackFailure>>;
  /** Safe to call twice; resolves when the port is closed. */
  close(): Promise<void>;
}

const PAGE: Readonly<Record<"done" | "cancelled" | "failed", string>> = {
  done: "Signed in. You can close this tab and return to Pochimail.",
  cancelled: "Sign-in cancelled. You can close this tab and return to Pochimail.",
  failed: "Sign-in could not be completed. You can close this tab and try again in Pochimail.",
};

const reply = (res: ServerResponse, status: number, kind: keyof typeof PAGE): void => {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    // Static local page: no script and no subresource, so nothing an attacker could load.
    "content-security-policy": "default-src 'none'",
    "cache-control": "no-store",
    connection: "close",
  });
  res.end(`<!doctype html><meta charset="utf-8"><title>Pochimail</title><p>${PAGE[kind]}</p>`);
};

/**
 * Opens a loopback listener on `127.0.0.1` with a random port (ADR 0007). The redirect is plain
 * http on the loopback interface (RFC 8252): it never leaves the device, and what the provider
 * sends back is an authorization code that is useless without the PKCE verifier.
 */
export const openLoopbackReceiver = async (): AsyncResult<LoopbackReceiver, ProviderFailed> => {
  const sockets = new Set<Socket>();
  const server: Server = createServer();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  const listening = await new Promise<Result<number, ProviderFailed>>((resolve) => {
    server.once("error", () => resolve(err(new ProviderFailed("Loopback listener failed"))));
    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      const address = server.address();
      if (address === null || typeof address === "string") {
        resolve(err(new ProviderFailed("Loopback listener failed")));
        return;
      }
      resolve(ok(address.port));
    });
  });
  if (!listening.ok) {
    server.close();
    return listening;
  }

  let closedPromise: Promise<void> | undefined;
  /** Set once `waitForCode` runs; earlier callbacks wait in `queued` instead of being lost. */
  let deliver: ((url: URL, response: ServerResponse) => void) | undefined;
  const queued: Array<{ readonly url: URL; readonly response: ServerResponse }> = [];
  server.on("request", (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (deliver !== undefined) {
      deliver(url, response);
      return;
    }
    // Bounded: a local process cannot grow the queue while the flow is not waiting yet.
    if (queued.length >= 8) {
      reply(response, 429, "failed");
      return;
    }
    queued.push({ url, response });
  });

  const close = (): Promise<void> => {
    if (closedPromise !== undefined) return closedPromise;
    closedPromise = new Promise<void>((resolve) => {
      if (!server.listening) {
        for (const socket of sockets) socket.destroy();
        resolve();
        return;
      }
      // Stops accepting at once (the port is free); give the in-flight reply a moment to flush.
      server.close(() => resolve());
      const force = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
      }, CLOSE_GRACE_MS);
      if ("unref" in force) force.unref();
      server.once("close", () => clearTimeout(force));
    });
    return closedPromise;
  };

  return ok({
    redirectUri: `http://127.0.0.1:${listening.value}${CALLBACK_PATH}`,
    waitForCode: ({ state, signal, timeoutMs = SIGN_IN_TIMEOUT_MS }) =>
      new Promise<Result<string, LoopbackFailure>>((resolve) => {
        let answered = false;
        let settled = false;
        const finish = (result: Result<string, LoopbackFailure>): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          resolve(result);
          void close();
        };
        const onAbort = (): void => finish(err(new SignInCancelled()));
        const timer = setTimeout(() => finish(err(new SignInCancelled())), timeoutMs);
        // Never keep the process alive for a sign-in nobody answers.
        if ("unref" in timer) timer.unref();
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
          onAbort();
          return;
        }

        const handle = (url: URL, response: ServerResponse): void => {
          // Browsers also ask for /favicon.ico: only the callback path counts as the callback.
          if (url.pathname !== CALLBACK_PATH) {
            reply(response, 404, "failed");
            return;
          }
          if (answered) {
            // A replay or a stray redirect: refused, and it can never change the result.
            reply(response, 409, "failed");
            void close();
            return;
          }
          answered = true;

          const givenState = url.searchParams.get("state");
          if (givenState === null || givenState !== state) {
            reply(response, 400, "failed");
            finish(err(new InvalidCallback("state-mismatch")));
            return;
          }
          const failure = url.searchParams.get("error");
          if (failure !== null) {
            if (failure === "access_denied") {
              reply(response, 200, "cancelled");
              finish(err(new SignInCancelled()));
            } else {
              reply(response, 400, "failed");
              finish(err(new InvalidCallback("provider-error")));
            }
            return;
          }
          const code = url.searchParams.get("code");
          if (code === null || code.length === 0) {
            reply(response, 400, "failed");
            finish(err(new InvalidCallback("missing-code")));
            return;
          }
          reply(response, 200, "done");
          finish(ok(code));
        };

        // A fast browser can redirect before this call; those requests waited instead of being lost.
        deliver = handle;
        for (const waiting of queued.splice(0)) handle(waiting.url, waiting.response);
      }),
    close,
  });
};
