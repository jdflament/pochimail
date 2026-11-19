import type { Fetch, FetchInit, FetchResponse } from "@pochimail/net/egress/http-client";

/**
 * An invented Gmail: just enough of the REST API (profile, messages.list/get, history.list,
 * batchModify, trash, untrash, labels) for the adapter to run against, with answers shaped like
 * Gmail's JSON. All data is made up; nothing here is a recording of a real mailbox.
 */
export interface FakeGmailMessage {
  readonly id: string;
  readonly threadId: string;
  readonly receivedAt: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly snippet: string;
  readonly hasListUnsubscribe: boolean;
  readonly opened: boolean;
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: unknown;
}

interface Stored {
  readonly message: FakeGmailMessage;
  readonly labels: Set<string>;
  body: string;
  /** Position in arrival order. */
  readonly seq: number;
}

const B64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");
const PREFIX = "/gmail/v1/users/me/";

export interface FakeGmailServer {
  readonly fetch: Fetch;
  /** Mail arriving at the mailbox: one history entry per message. */
  add(message: FakeGmailMessage): void;
  setBody(id: string, body: string): void;
  labelsOf(id: string): readonly string[];
  /** The next `times` requests fail with this status (and `Retry-After` when given). */
  failNext(status: number, options?: { times?: number; retryAfter?: string }): void;
  /** History ids older than now are gone: `history.list` answers 404 for them. */
  expireHistory(): void;
  /** Only this bearer token is accepted from now on. */
  acceptOnly(token: string): void;
  requests(): readonly RecordedRequest[];
}

export function createFakeGmailServer(): FakeGmailServer {
  const messages = new Map<string, Stored>();
  const history: { id: number; added: string }[] = [];
  const labels = new Map<string, string>([
    ["INBOX", "INBOX"],
    ["UNREAD", "UNREAD"],
    ["TRASH", "TRASH"],
  ]);
  let historyId = 1000;
  let oldestKept = 0;
  let seq = 0;
  let token: string | null = null;
  let fault: { status: number; times: number; retryAfter?: string } | null = null;
  const log: RecordedRequest[] = [];

  const reply = (
    status: number,
    json: unknown,
    headers: Record<string, string> = {},
  ): FetchResponse => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => (json === null ? "" : JSON.stringify(json)),
  });

  const project = (full: Record<string, unknown>, fields: string | null) => {
    if (fields === null) return full;
    const out: Record<string, unknown> = {};
    for (const field of fields.split(",")) {
      const [top, nested] = field.split("/");
      if (top === undefined || !(top in full)) continue;
      const value = full[top];
      if (nested === undefined) out[top] = value;
      else
        out[top] = {
          ...(out[top] as object | undefined),
          [nested]: (value as Record<string, unknown>)[nested],
        };
    }
    return out;
  };

  const render = (s: Stored, query: URLSearchParams): Record<string, unknown> => {
    const wanted = new Set(query.getAll("metadataHeaders").map((h) => h.toLowerCase()));
    const all: [string, string][] = [
      ["From", s.message.from],
      ["To", s.message.to.join(", ")],
      ["Subject", s.message.subject],
      ...(s.message.hasListUnsubscribe
        ? ([["List-Unsubscribe", "<mailto:unsub@example.com>"]] as [string, string][])
        : []),
    ];
    const headers = all
      .filter(([name]) => query.get("format") !== "metadata" || wanted.has(name.toLowerCase()))
      .map(([name, value]) => ({ name, value }));
    const payload =
      query.get("format") === "full"
        ? { mimeType: "text/plain", headers, body: { data: B64(s.body) }, parts: [] }
        : { headers };
    return {
      id: s.message.id,
      threadId: s.message.threadId,
      labelIds: [...s.labels],
      snippet: s.message.snippet,
      sizeEstimate: 1000 + s.body.length,
      internalDate: String(Date.parse(s.message.receivedAt)),
      payload,
    };
  };

  const route = (
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
  ): FetchResponse => {
    if (method === "GET" && path === "profile")
      return reply(200, { emailAddress: "owner@example.com", historyId: String(historyId) });
    if (method === "GET" && path === "messages") {
      const max = Number(query.get("maxResults") ?? 100);
      const start = Number(query.get("pageToken") ?? 0);
      const listed = [...messages.values()]
        .filter((s) => !s.labels.has("TRASH"))
        .sort(
          (a, b) =>
            Date.parse(b.message.receivedAt) - Date.parse(a.message.receivedAt) || b.seq - a.seq,
        );
      const page = listed.slice(start, start + max);
      const end = start + page.length;
      return reply(200, {
        ...(page.length === 0
          ? {}
          : { messages: page.map((s) => ({ id: s.message.id, threadId: s.message.threadId })) }),
        ...(end < listed.length ? { nextPageToken: String(end) } : {}),
      });
    }
    if (method === "GET" && path === "history") {
      if (Number(query.get("startHistoryId")) < oldestKept)
        return reply(404, { error: { code: 404, message: "Requested entity was not found." } });
      const after = Number(query.get("startHistoryId"));
      const entries = history.filter((h) => h.id > after);
      return reply(200, {
        history: entries.map((h) => ({
          id: String(h.id),
          messagesAdded: [{ message: { id: h.added } }],
        })),
        historyId: String(historyId),
      });
    }
    if (method === "POST" && path === "messages/batchModify") {
      const input = body as { ids: string[]; addLabelIds: string[]; removeLabelIds: string[] };
      if (input.ids.length > 1000)
        return reply(400, { error: { code: 400, message: "Too many ids" } });
      for (const id of input.ids) {
        const s = messages.get(id);
        if (s === undefined) continue;
        for (const l of input.removeLabelIds) s.labels.delete(l);
        for (const l of input.addLabelIds) s.labels.add(l);
      }
      return reply(204, null);
    }
    const one = /^messages\/([^/]+)(?:\/(trash|untrash))?$/.exec(path);
    if (one !== null) {
      const stored = messages.get(decodeURIComponent(one[1] ?? ""));
      if (stored === undefined) return reply(404, { error: { code: 404, message: "Not Found" } });
      if (method === "POST" && one[2] === "trash") {
        stored.labels.delete("INBOX");
        stored.labels.add("TRASH");
        return reply(200, { id: stored.message.id, labelIds: [...stored.labels] });
      }
      if (method === "POST" && one[2] === "untrash") {
        stored.labels.delete("TRASH");
        stored.labels.add("INBOX");
        return reply(200, { id: stored.message.id, labelIds: [...stored.labels] });
      }
      if (method === "GET") return reply(200, project(render(stored, query), query.get("fields")));
    }
    if (method === "GET" && path === "labels")
      return reply(200, { labels: [...labels].map(([name, id]) => ({ id, name })) });
    if (method === "POST" && path === "labels") {
      const name = (body as { name: string }).name;
      const id = `Label_${labels.size + 1}`;
      labels.set(name, id);
      return reply(200, { id, name });
    }
    return reply(404, { error: { code: 404, message: "Not Found" } });
  };

  const fetch: Fetch = async (rawUrl: string, init: FetchInit) => {
    const url = new URL(rawUrl);
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname;
    const body = init.body === undefined ? undefined : (JSON.parse(init.body) as unknown);
    log.push({ method: init.method ?? "GET", path, query: url.searchParams, body });
    if (fault !== null && fault.times > 0) {
      fault.times -= 1;
      return reply(
        fault.status,
        {
          error: {
            code: fault.status,
            errors: [{ reason: fault.status === 403 ? "rateLimitExceeded" : "failed" }],
          },
        },
        fault.retryAfter === undefined ? {} : { "retry-after": fault.retryAfter },
      );
    }
    const auth = init.headers?.authorization ?? init.headers?.Authorization;
    if (token !== null && auth !== `Bearer ${token}`) return reply(401, { error: { code: 401 } });
    return route(init.method ?? "GET", path, url.searchParams, body);
  };

  return {
    fetch,
    add(message) {
      const labelSet = new Set(["INBOX"]);
      if (!message.opened) labelSet.add("UNREAD");
      messages.set(message.id, { message, labels: labelSet, body: "", seq: ++seq });
      history.push({ id: ++historyId, added: message.id });
    },
    setBody(id, body) {
      const s = messages.get(id);
      if (s) s.body = body;
    },
    labelsOf: (id) => [...(messages.get(id)?.labels ?? [])],
    failNext(status, options = {}) {
      fault = {
        status,
        times: options.times ?? 1,
        ...(options.retryAfter === undefined ? {} : { retryAfter: options.retryAfter }),
      };
    },
    expireHistory() {
      historyId += 1;
      oldestKept = historyId;
    },
    acceptOnly(value) {
      token = value;
    },
    requests: () => log,
  };
}
