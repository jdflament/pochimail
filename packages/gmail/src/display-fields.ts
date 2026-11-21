import type { MailProviderError } from "@pochimail/actions/ports/mail-commands";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { ProviderFailed } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { GMAIL_QUOTA_UNITS } from "@pochimail/net/egress/rate-limit";
import { displaySchema, fullMessageSchema, type GmailPart } from "./api.ts";
import type { GmailClient } from "./client.ts";

/** What a screen shows for a message. Fetched live by id and never stored (ADR 0014). */
export interface DisplayFields {
  readonly id: string;
  readonly subject: string;
  readonly snippet: string;
}

const DISPLAY_FIELDS = "id,snippet,payload/headers";

function decode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/** The first text/plain part, else the first text/html part with its tags dropped. */
function textOf(part: GmailPart): string | null {
  const parts: GmailPart[] = [part];
  const queue = [...parts];
  let html: string | null = null;
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    queue.push(...next.parts);
    const data = next.body.data;
    if (data === undefined) continue;
    if (next.mimeType === "text/plain") return decode(data);
    if (next.mimeType === "text/html" && html === null) html = decode(data).replace(/<[^>]*>/g, "");
  }
  return html;
}

/** Live reads for display: a message body, and subject and snippet by id. */
export class GmailDisplay {
  constructor(private readonly client: GmailClient) {}

  async body(id: string, signal: CancelSignal): AsyncResult<string, MailProviderError> {
    const reply = await this.client.call({
      path: `messages/${encodeURIComponent(id)}`,
      query: { format: "full" },
      cost: GMAIL_QUOTA_UNITS.messagesGet,
      signal,
    });
    if (!reply.ok) return reply;
    if (reply.value.status === 404) return err(new ProviderFailed("Message no longer exists"));
    const parsed = fullMessageSchema.safeParse(reply.value.json);
    const text = parsed.success ? textOf(parsed.data.payload) : null;
    return text === null ? err(new ProviderFailed("Message has no text")) : ok(text);
  }

  async fields(
    ids: readonly string[],
    signal: CancelSignal,
  ): AsyncResult<readonly DisplayFields[], MailProviderError> {
    const out: DisplayFields[] = [];
    for (const id of ids) {
      const reply = await this.client.call({
        path: `messages/${encodeURIComponent(id)}`,
        query: { format: "metadata", metadataHeaders: ["Subject"], fields: DISPLAY_FIELDS },
        cost: GMAIL_QUOTA_UNITS.messagesGet,
        signal,
      });
      if (!reply.ok) return reply;
      if (reply.value.status === 404) continue;
      const parsed = displaySchema.safeParse(reply.value.json);
      if (!parsed.success) continue;
      const subject = parsed.data.payload.headers.find((h) => h.name.toLowerCase() === "subject");
      out.push({ id: parsed.data.id, subject: subject?.value ?? "", snippet: parsed.data.snippet });
    }
    return ok(out);
  }
}
