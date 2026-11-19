import { type Command, inverseOf } from "@pochimail/core/domain/action";
import type { AppliedCommand, MailProviderError } from "@pochimail/core/ports/mail-provider";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { ProviderFailed } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { GMAIL_QUOTA_UNITS } from "@pochimail/net/egress/rate-limit";
import { createdLabelSchema, EXTRA_QUOTA_UNITS, labelsSchema } from "./api.ts";
import type { GmailClient } from "./client.ts";

/** Gmail's `batchModify` takes at most this many ids per call. */
export const BATCH_MODIFY_MAX = 1_000;

type Done = AsyncResult<void, MailProviderError>;

/**
 * Archive (remove `INBOX`), labels, trash and their inverses. Delete is `trash`, never a
 * permanent delete (ADR 0012). `mark-handled` and `unsubscribe` change nothing at Gmail: they are
 * Pochimail's own bookkeeping (an unsubscribe is sent elsewhere and has no inverse).
 */
export class GmailCommands {
  private labelIds: Map<string, string> | null = null;

  constructor(private readonly client: GmailClient) {}

  async execute(
    commands: readonly Command[],
    signal: CancelSignal,
  ): AsyncResult<readonly AppliedCommand[], MailProviderError> {
    const applied: AppliedCommand[] = [];
    for (const command of commands) {
      const done = await this.run(command, signal);
      if (!done.ok) return done;
      applied.push({ command, inverse: inverseOf(command) });
    }
    return ok(applied);
  }

  private async run(command: Command, signal: CancelSignal): Done {
    switch (command.kind) {
      case "archive":
        return this.modify(command.messageIds, { remove: ["INBOX"] }, signal);
      case "unarchive":
        return this.modify(command.messageIds, { add: ["INBOX"] }, signal);
      case "apply-label":
        return this.withLabel(command, true, signal);
      case "remove-label":
        return this.withLabel(command, false, signal);
      case "trash":
        return this.eachMessage(command.messageIds, "trash", signal);
      case "untrash":
        return this.eachMessage(command.messageIds, "untrash", signal);
      default:
        return ok(undefined);
    }
  }

  private async modify(
    ids: readonly string[],
    change: { readonly add?: readonly string[]; readonly remove?: readonly string[] },
    signal: CancelSignal,
  ): Done {
    for (let i = 0; i < ids.length; i += BATCH_MODIFY_MAX) {
      const reply = await this.client.call({
        method: "POST",
        path: "messages/batchModify",
        body: {
          ids: ids.slice(i, i + BATCH_MODIFY_MAX),
          addLabelIds: change.add ?? [],
          removeLabelIds: change.remove ?? [],
        },
        cost: GMAIL_QUOTA_UNITS.messagesBatchModify,
        signal,
      });
      if (!reply.ok) return reply;
    }
    return ok(undefined);
  }

  private async eachMessage(
    ids: readonly string[],
    verb: "trash" | "untrash",
    signal: CancelSignal,
  ): Done {
    for (const id of ids) {
      const reply = await this.client.call({
        method: "POST",
        path: `messages/${encodeURIComponent(id)}/${verb}`,
        cost: EXTRA_QUOTA_UNITS.trash,
        signal,
      });
      if (!reply.ok) return reply;
      // 404: the message is already gone, so there is nothing left to move.
    }
    return ok(undefined);
  }

  private async withLabel(command: Command, add: boolean, signal: CancelSignal): Done {
    if (command.label === undefined)
      return err(new ProviderFailed("A label command needs a label"));
    const id = await this.labelId(command.label, add, signal);
    if (!id.ok) return id;
    if (id.value === null) return ok(undefined); // removing a label that does not exist
    const ids = [id.value];
    return this.modify(command.messageIds, add ? { add: ids } : { remove: ids }, signal);
  }

  /** Label name to Gmail id, creating the label when it is being applied and does not exist. */
  private async labelId(
    name: string,
    create: boolean,
    signal: CancelSignal,
  ): AsyncResult<string | null, MailProviderError> {
    if (this.labelIds === null) {
      const reply = await this.client.call({
        path: "labels",
        cost: EXTRA_QUOTA_UNITS.labels,
        signal,
      });
      if (!reply.ok) return reply;
      const parsed = labelsSchema.safeParse(reply.value.json);
      if (!parsed.success) return err(new ProviderFailed("Unexpected Gmail labels"));
      this.labelIds = new Map(parsed.data.labels.map((l) => [l.name, l.id]));
    }
    const known = this.labelIds.get(name);
    if (known !== undefined || !create) return ok(known ?? null);
    const created = await this.client.call({
      method: "POST",
      path: "labels",
      body: { name },
      cost: EXTRA_QUOTA_UNITS.labels,
      signal,
    });
    if (!created.ok) return created;
    const parsed = createdLabelSchema.safeParse(created.value.json);
    if (!parsed.success) return err(new ProviderFailed("Unexpected Gmail label"));
    this.labelIds.set(name, parsed.data.id);
    return ok(parsed.data.id);
  }
}
