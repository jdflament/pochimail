import { type Command, inverseOf } from "@pochimail/actions/model/action";
import type { AppliedCommand, MailProviderError } from "@pochimail/actions/ports/mail-commands";
import { PartiallyApplied } from "@pochimail/actions/ports/mail-commands";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { ProviderFailed } from "@pochimail/kernel/errors";
import type { MessageId } from "@pochimail/kernel/ids";
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
 *
 * A failure part-way (a later chunk of ids, a later command) returns `PartiallyApplied`: what
 * already happened is listed with its inverse, so none of it loses its undo.
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
      const done: MessageId[] = [];
      const result = await this.run(command, signal, done);
      if (!result.ok) {
        const partial =
          done.length === 0
            ? []
            : [
                {
                  command: { ...command, messageIds: done },
                  inverse: inverseOf({ ...command, messageIds: done }),
                },
              ];
        const soFar = [...applied, ...partial];
        return err(soFar.length > 0 ? new PartiallyApplied(result.error, soFar) : result.error);
      }
      applied.push({ command, inverse: inverseOf(command) });
    }
    return ok(applied);
  }

  private async run(command: Command, signal: CancelSignal, done: MessageId[]): Done {
    const ids = command.messageIds;
    switch (command.kind) {
      case "archive":
        return this.modify(ids, { remove: ["INBOX"] }, signal, done);
      case "unarchive":
        return this.modify(ids, { add: ["INBOX"] }, signal, done);
      case "apply-label":
        return this.withLabel(command, true, signal, done);
      case "remove-label":
        return this.withLabel(command, false, signal, done);
      case "trash":
        return this.eachMessage(ids, "trash", signal, done);
      case "untrash":
        return this.eachMessage(ids, "untrash", signal, done);
      default:
        done.push(...ids);
        return ok(undefined);
    }
  }

  /** `batchModify` in chunks; `done` collects the ids of every chunk Gmail accepted. */
  private async modify(
    ids: readonly MessageId[],
    change: { readonly add?: readonly string[]; readonly remove?: readonly string[] },
    signal: CancelSignal,
    done: MessageId[],
  ): Done {
    for (let i = 0; i < ids.length; i += BATCH_MODIFY_MAX) {
      const chunk = ids.slice(i, i + BATCH_MODIFY_MAX);
      const reply = await this.client.call({
        method: "POST",
        path: "messages/batchModify",
        body: { ids: chunk, addLabelIds: change.add ?? [], removeLabelIds: change.remove ?? [] },
        cost: GMAIL_QUOTA_UNITS.messagesBatchModify,
        signal,
      });
      if (!reply.ok) return reply;
      if (reply.value.status === 404) return err(new ProviderFailed("A message no longer exists"));
      done.push(...chunk);
    }
    return ok(undefined);
  }

  private async eachMessage(
    ids: readonly MessageId[],
    verb: "trash" | "untrash",
    signal: CancelSignal,
    done: MessageId[],
  ): Done {
    for (const id of ids) {
      const reply = await this.client.call({
        method: "POST",
        path: `messages/${encodeURIComponent(id)}/${verb}`,
        cost: EXTRA_QUOTA_UNITS.trash,
        signal,
      });
      if (!reply.ok) return reply;
      if (reply.value.status === 404) return err(new ProviderFailed("A message no longer exists"));
      done.push(id);
    }
    return ok(undefined);
  }

  private async withLabel(
    command: Command,
    add: boolean,
    signal: CancelSignal,
    done: MessageId[],
  ): Done {
    if (command.label === undefined)
      return err(new ProviderFailed("A label command needs a label"));
    const id = await this.labelId(command.label, add, signal);
    if (!id.ok) return id;
    if (id.value === null) {
      done.push(...command.messageIds); // removing a label that does not exist changes nothing
      return ok(undefined);
    }
    const ids = [id.value];
    return this.modify(command.messageIds, add ? { add: ids } : { remove: ids }, signal, done);
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
