import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import { type IncomingMessage, incomingMessageSchema } from "../model/message.ts";

/** Longest snippet kept. Providers may hand over more; a body must never be stored (D11). */
export const MAX_SNIPPET_CHARS = 200;

/**
 * The provider is an untrusted boundary (zod): `parse` drops any field the schema does not know
 * (a smuggled `body`, `attachments`…), invalid or foreign-workspace messages are skipped, and
 * the snippet is cut to `MAX_SNIPPET_CHARS`. Only these headers and metadata reach a repository.
 */
export function sanitizeIncoming(
  message: IncomingMessage,
  request: { readonly workspaceId: WorkspaceId; readonly accountId: AccountId },
): IncomingMessage[] {
  const parsed = incomingMessageSchema.safeParse(message);
  if (!parsed.success) return [];
  const m = parsed.data;
  if (m.workspaceId !== request.workspaceId || m.accountId !== request.accountId) return [];
  return [{ ...m, snippet: m.snippet.slice(0, MAX_SNIPPET_CHARS) }];
}
