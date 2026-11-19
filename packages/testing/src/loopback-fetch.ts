import type { CancelSignal } from "@pochimail/kernel/common";

export interface LoopbackFetchInit {
  readonly method: "POST" | "GET";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: CancelSignal;
}

/**
 * Test-only `FetchLike` for the fake OAuth server, which listens on loopback HTTP. Production uses
 * the M2-06 egress `HttpClient`, which refuses plain HTTP by design, so socket-level tests use this
 * instead. Never wire it into an app: it has no allow-list and no timeout.
 */
export const loopbackFetch = async (
  url: string,
  init: LoopbackFetchInit,
): Promise<{ readonly ok: boolean; readonly status: number; readonly body: string }> => {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (init.signal?.aborted === true) controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, {
      method: init.method,
      ...(init.headers === undefined ? {} : { headers: init.headers }),
      ...(init.body === undefined ? {} : { body: init.body }),
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } finally {
    init.signal?.removeEventListener("abort", abort);
  }
};
