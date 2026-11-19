import { type Message, messageSchema } from "@pochimail/core/domain/mail";
import type { Row } from "../shared/sql.ts";
import { flag, json } from "../shared/values.ts";

export const MESSAGE_COLUMNS =
  "workspace_id, id, account_id, thread_id, sender, recipients, subject, snippet, received_at, has_list_unsubscribe, opened, topic_ids, suspicious_reasons, suspicious_confidence, category";

export const messageOf = (r: Row): Message =>
  messageSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    threadId: r.thread_id,
    from: r.sender,
    to: json(r.recipients),
    subject: r.subject,
    snippet: r.snippet,
    receivedAt: r.received_at,
    hasListUnsubscribe: flag(r.has_list_unsubscribe),
    opened: flag(r.opened),
    topicIds: json(r.topic_ids),
    ...(r.suspicious_reasons === null
      ? {}
      : {
          suspicious: { reasons: json(r.suspicious_reasons), confidence: r.suspicious_confidence },
        }),
    category: r.category,
  });
