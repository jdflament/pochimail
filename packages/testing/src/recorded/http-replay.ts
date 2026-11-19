import type { Clock } from "@pochimail/kernel/clock";
import { z } from "zod";
import { assertScrubbed } from "./scrub.ts";

// DEV/TEST ONLY. A recording is plain JSON: synthetic traffic in the shape a provider sends.

const entrySchema = z.object({
  request: z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
    url: z.url(),
  }),
  response: z.union([
    z.object({
      status: z.int().min(100).max(599),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.string(),
    }),
    /** The socket dies before any response: what a dropped connection looks like to `fetch`. */
    z.object({ drop: z.literal(true) }),
  ]),
});

export const recordingSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema),
});
export type Recording = z.infer<typeof recordingSchema>;
export type RecordedEntry = z.infer<typeof entrySchema>;

/** Parses and scrubs a recording read from disk; throws on a malformed or unscrubbed one. */
export function loadRecording(name: string, json: string): Recording {
  assertScrubbed(name, json);
  return recordingSchema.parse(JSON.parse(json));
}

/** What the egress `HttpClient` transport (`Fetch`) needs back; structurally the same type. */
export interface ReplayResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type ReplayFetch = (
  url: string,
  init: { readonly method?: string; readonly signal: AbortSignal },
) => Promise<ReplayResponse>;

export interface ReplayRequestRecord {
  readonly method: string;
  readonly url: string;
}

export interface HttpReplay {
  /** Plug into `createHttpClient({ fetch })`: replay never bypasses the egress allow-list. */
  readonly fetch: ReplayFetch;
  /** Every request that reached the transport, in order. */
  requests(): readonly ReplayRequestRecord[];
  /** Requests no entry covered; each also failed loudly with a thrown error. */
  unmatched(): readonly ReplayRequestRecord[];
}

/** Query parameters sorted, so recording order never decides a match. */
const keyOf = (method: string, rawUrl: string): string => {
  const url = new URL(rawUrl);
  url.searchParams.sort();
  return `${method} ${url.origin}${url.pathname}${url.search}`;
};

/**
 * Serves a recording. Entries sharing a request are answered in order and the last one repeats,
 * so `[429, 200]` scripts a throttle followed by recovery. An unrecorded request throws rather
 * than answering 404, so a drifting adapter fails the test instead of passing on a made-up reply.
 */
export function createHttpReplay(recording: Recording): HttpReplay {
  const queues = new Map<string, RecordedEntry["response"][]>();
  for (const entry of recording.entries) {
    const key = keyOf(entry.request.method, entry.request.url);
    queues.set(key, [...(queues.get(key) ?? []), entry.response]);
  }
  const seen: ReplayRequestRecord[] = [];
  const missed: ReplayRequestRecord[] = [];

  return {
    requests: () => [...seen],
    unmatched: () => [...missed],
    fetch: async (url, init) => {
      const record = { method: init.method ?? "GET", url };
      seen.push(record);
      if (init.signal.aborted) throw new DOMException("aborted", "AbortError");
      const queue = queues.get(keyOf(record.method, url));
      const response = queue && (queue.length > 1 ? queue.shift() : queue[0]);
      if (response === undefined) {
        missed.push(record);
        throw new Error(`No recorded response for ${record.method} ${new URL(url).pathname}`);
      }
      if ("drop" in response) throw new TypeError("fetch failed");
      const headers = new Map(
        Object.entries(response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      return {
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
        text: async () => response.body,
      };
    },
  };
}

const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): { status: number; headers: Record<string, string>; body: string } => ({
  status,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

/** Scripted provider failures, ready to splice into a recording as `response`. */
export const scripts = {
  /** 429 with `Retry-After` in seconds. */
  throttled: (retryAfterSeconds: number) =>
    json(
      429,
      { error: { code: 429, message: "Rate limit exceeded" } },
      {
        "retry-after": String(retryAfterSeconds),
      },
    ),
  /** 429 with `Retry-After` as an HTTP-date computed from the injected clock (never the real one). */
  throttledUntil: (clock: Clock, retryAfterSeconds: number) =>
    json(
      429,
      { error: { code: 429, message: "Rate limit exceeded" } },
      {
        "retry-after": new Date(clock.now().getTime() + retryAfterSeconds * 1000).toUTCString(),
      },
    ),
  /** 429 with no `Retry-After`: the caller must back off on its own. */
  throttledWithoutHint: () => json(429, { error: { code: 429, message: "Rate limit exceeded" } }),
  /** An expired cursor: Gmail answers 404 for a pruned history id, Graph 410 for a stale delta token. */
  expiredCursor: (status: 404 | 410 = 404) =>
    json(status, { error: { code: status, message: "Requested entity was not found." } }),
  droppedConnection: () => ({ drop: true as const }),
};
