import type { IncomingMessage } from "@pochimail/mailbox/model/message";
import { incomingMessageSchema } from "@pochimail/mailbox/model/message";
import type { FixtureMessage } from "../fixture-mailbox/mailbox-reader.ts";
import type { RecordedEntry, Recording } from "./http-replay.ts";

// DEV/TEST ONLY. Synthetic Gmail- and Graph-shaped traffic generated from the fixture mailbox,
// plus tiny reference readers that prove the recording carries the whole mailbox. Real adapters
// run the same contract (`protocol-contract.ts`) against their own code.

export interface MailboxIds {
  readonly accountId: string;
  readonly workspaceId: string;
}

export const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0/me";
const UNSUBSCRIBE_VALUE = "<mailto:unsubscribe@list.example.net>";

const ok = (body: unknown): RecordedEntry["response"] => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const page = <T>(items: readonly T[], size: number): T[][] => {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length === 0 ? [[]] : pages;
};

export interface WireOptions {
  readonly pageSize?: number;
}

/** `users.messages.list` pages plus one `messages.get?format=metadata` per message. */
export function gmailRecording(
  messages: readonly FixtureMessage[],
  options: WireOptions = {},
): Recording {
  const size = options.pageSize ?? 100;
  const entries: RecordedEntry[] = [];
  const pages = page(messages, size);
  pages.forEach((items, index) => {
    const query = new URLSearchParams({ maxResults: String(size) });
    if (index > 0) query.set("pageToken", `page-${index}`);
    const body: Record<string, unknown> = {
      messages: items.map(({ message }) => ({ id: message.id, threadId: message.threadId })),
    };
    if (index < pages.length - 1) body.nextPageToken = `page-${index + 1}`;
    entries.push({
      request: { method: "GET", url: `${GMAIL_BASE}/messages?${query}` },
      response: ok(body),
    });
  });
  for (const { message } of messages) {
    entries.push({
      request: {
        method: "GET",
        url: `${GMAIL_BASE}/messages/${encodeURIComponent(message.id)}?format=metadata`,
      },
      response: ok({
        id: message.id,
        threadId: message.threadId,
        labelIds: message.opened ? ["INBOX"] : ["INBOX", "UNREAD"],
        snippet: message.snippet,
        internalDate: String(Date.parse(message.receivedAt)),
        payload: {
          headers: [
            { name: "From", value: message.from },
            { name: "To", value: message.to.join(", ") },
            { name: "Subject", value: message.subject },
            ...(message.hasListUnsubscribe
              ? [{ name: "List-Unsubscribe", value: UNSUBSCRIBE_VALUE }]
              : []),
          ],
        },
      }),
    });
  }
  return { version: 1, entries };
}

/** `GET /me/messages` pages linked by `@odata.nextLink`, as Graph sends them. */
export function graphRecording(
  messages: readonly FixtureMessage[],
  options: WireOptions = {},
): Recording {
  const size = options.pageSize ?? 100;
  const pages = page(messages, size);
  const urlOf = (index: number) =>
    `${GRAPH_BASE}/messages?$top=${size}${index > 0 ? `&$skiptoken=page-${index}` : ""}`;
  return {
    version: 1,
    entries: pages.map((items, index) => ({
      request: { method: "GET", url: urlOf(index) },
      response: ok({
        value: items.map(({ message }) => ({
          id: message.id,
          conversationId: message.threadId,
          subject: message.subject,
          bodyPreview: message.snippet,
          receivedDateTime: message.receivedAt,
          isRead: message.opened,
          from: { emailAddress: { address: message.from } },
          toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
          internetMessageHeaders: message.hasListUnsubscribe
            ? [{ name: "List-Unsubscribe", value: UNSUBSCRIBE_VALUE }]
            : [],
        })),
        ...(index < pages.length - 1 ? { "@odata.nextLink": urlOf(index + 1) } : {}),
      }),
    })),
  };
}

/** The slice of the egress `HttpClient` the readers need, so this package never imports `mail`. */
export interface WireHttp {
  request(request: {
    url: string;
  }): Promise<
    | { readonly ok: true; readonly value: { readonly status: number; readonly body: string } }
    | { readonly ok: false; readonly error: Error }
  >;
}

async function getJson(http: WireHttp, url: string): Promise<Record<string, unknown>> {
  const result = await http.request({ url });
  if (!result.ok) throw result.error;
  if (result.value.status !== 200) throw new Error(`HTTP ${result.value.status}`);
  return JSON.parse(result.value.body) as Record<string, unknown>;
}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

export async function readGmailMailbox(
  http: WireHttp,
  ids: MailboxIds,
  pageSize = 100,
): Promise<IncomingMessage[]> {
  const out: IncomingMessage[] = [];
  let token = "";
  for (let guard = 0; guard < 1000; guard++) {
    const query = new URLSearchParams({ maxResults: String(pageSize) });
    if (token) query.set("pageToken", token);
    const list = await getJson(http, `${GMAIL_BASE}/messages?${query}`);
    for (const ref of rows(list.messages)) {
      const raw = await getJson(
        http,
        `${GMAIL_BASE}/messages/${encodeURIComponent(text(ref.id))}?format=metadata`,
      );
      const headers = new Map(
        rows((raw.payload as Row | undefined)?.headers).map((h) => [text(h.name), text(h.value)]),
      );
      out.push(
        incomingMessageSchema.parse({
          schemaVersion: 1,
          id: text(raw.id),
          workspaceId: ids.workspaceId,
          accountId: ids.accountId,
          threadId: text(raw.threadId),
          from: headers.get("From"),
          to: (headers.get("To") ?? "").split(", "),
          subject: headers.get("Subject"),
          snippet: text(raw.snippet),
          receivedAt: new Date(Number(raw.internalDate)).toISOString(),
          hasListUnsubscribe: headers.has("List-Unsubscribe"),
          opened: !Array.isArray(raw.labelIds) || !raw.labelIds.includes("UNREAD"),
          topicIds: [],
        }),
      );
    }
    token = text(list.nextPageToken);
    if (!token) return out;
  }
  throw new Error("Gmail listing never finished");
}

export async function readGraphMailbox(
  http: WireHttp,
  ids: MailboxIds,
  pageSize = 100,
): Promise<IncomingMessage[]> {
  const out: IncomingMessage[] = [];
  let url: string | null = `${GRAPH_BASE}/messages?$top=${pageSize}`;
  for (let guard = 0; url !== null && guard < 1000; guard++) {
    const body: Row = await getJson(http, url);
    for (const m of rows(body.value)) {
      const address = (party: unknown) => text(((party as Row).emailAddress as Row).address);
      out.push(
        incomingMessageSchema.parse({
          schemaVersion: 1,
          id: text(m.id),
          workspaceId: ids.workspaceId,
          accountId: ids.accountId,
          threadId: text(m.conversationId),
          from: address(m.from),
          to: rows(m.toRecipients).map(address),
          subject: text(m.subject),
          snippet: text(m.bodyPreview),
          receivedAt: new Date(text(m.receivedDateTime)).toISOString(),
          hasListUnsubscribe: rows(m.internetMessageHeaders).some(
            (h) => text(h.name).toLowerCase() === "list-unsubscribe",
          ),
          opened: m.isRead === true,
          topicIds: [],
        }),
      );
    }
    const next: string = text(body["@odata.nextLink"]);
    url = next === "" ? null : next;
  }
  return out;
}
