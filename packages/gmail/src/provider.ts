import type { OAuthTokenSource } from "@pochimail/accounts/ports/oauth";
import type { Command } from "@pochimail/actions/model/action";
import type {
  AppliedCommand,
  MailCommands,
  MailProviderCapabilities,
  MailProviderError,
} from "@pochimail/actions/ports/mail-commands";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { Cancelled } from "@pochimail/kernel/errors";
import type { AccountId } from "@pochimail/kernel/ids";
import { err } from "@pochimail/kernel/result";
import type { MailReader, SyncCursor } from "@pochimail/mailbox/ports/mail-reader";
import type { RateLimitedClient } from "@pochimail/net/egress/rate-limit";
import { GmailClient } from "./client.ts";
import { BATCH_MODIFY_MAX, GmailCommands } from "./commands.ts";
import { type DisplayFields, GmailDisplay } from "./display-fields.ts";
import type { Identity } from "./mapping.ts";
import { GmailSync, type GmailSyncOptions } from "./sync.ts";

export const GMAIL_CAPABILITIES: MailProviderCapabilities = {
  organization: "labels",
  archive: "remove-inbox-label",
  batchModify: { maxCommands: BATCH_MODIFY_MAX },
  deltaSync: true,
  pushWakeups: false,
  unsubscribeSend: false,
};

export interface GmailProviderDeps extends Identity {
  readonly http: RateLimitedClient;
  readonly tokens: OAuthTokenSource;
  readonly sync?: GmailSyncOptions;
}

export interface GmailProvider extends MailReader<MailProviderError>, MailCommands {
  /** Subject and snippet by id, for a screen; fetched live, never stored. Not part of any port yet. */
  fetchDisplayFields(
    ids: readonly string[],
    signal: CancelSignal,
  ): AsyncResult<readonly DisplayFields[], MailProviderError>;
}

/** The Gmail API behind the mailbox and actions ports (OAuth sign-in lives in net). */
export function createGmailProvider(deps: GmailProviderDeps): GmailProvider {
  const account: { id: AccountId } = { id: deps.accountId };
  const client = new GmailClient({ http: deps.http, tokens: deps.tokens, account });
  const sync = new GmailSync(client, deps, deps.sync);
  const commands = new GmailCommands(client);
  const display = new GmailDisplay(client);
  const live = <T>(signal: CancelSignal, run: () => AsyncResult<T, MailProviderError>) =>
    signal.aborted ? Promise.resolve(err(new Cancelled())) : run();
  return {
    capabilities: GMAIL_CAPABILITIES,
    sync: (cursor: SyncCursor | null, signal) => live(signal, () => sync.execute(cursor, signal)),
    applyCommands: (
      list: readonly Command[],
      signal,
    ): AsyncResult<readonly AppliedCommand[], MailProviderError> =>
      live(signal, () => commands.execute(list, signal)),
    fetchBody: (messageId, signal) => live(signal, () => display.body(messageId, signal)),
    fetchDisplayFields: (ids, signal) => live(signal, () => display.fields(ids, signal)),
  };
}
