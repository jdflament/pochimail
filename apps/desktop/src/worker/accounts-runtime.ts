import { ConnectAccount } from "@pochimail/accounts/use-cases/connect-account";
import { DEFAULT_APP_SETTINGS } from "@pochimail/core/ports/settings-store";
import { openStorage } from "@pochimail/db/open-storage";
import { createSqliteUnitOfWork } from "@pochimail/db/sqlite-unit-of-work";
import { WorkspaceId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { platformFetch } from "@pochimail/net/oauth/http";
import { OAuthSignIn } from "@pochimail/net/oauth/sign-in";
import { createAccountProcedures } from "./account-procedures.ts";
import type { WorkerStart } from "./start.ts";

/** The one local workspace of a device (Pochimail has no accounts of its own). */
const LOCAL_WORKSPACE = unwrap(WorkspaceId("wsp_00000000-0000-4000-8000-000000000001"));

/**
 * The real composition for accounts: the encrypted database (key from main), the keychain-backed secret
 * store and the Google sign-in over the egress policy. Without a key the database stays closed and the
 * caller keeps its empty answers.
 */
export const createAccountsRuntime = (
  start: WorkerStart,
  options: {
    readonly databasePath: string;
    readonly env: Readonly<Record<string, string | undefined>>;
  },
) => {
  if (start.databaseKey === undefined) return undefined;
  const storage = openStorage(options.databasePath, start.databaseKey);
  if (!storage.ok) return undefined;
  const clock = { now: () => new Date() };
  const { uow } = createSqliteUnitOfWork(storage.value, clock);
  const signIn = new OAuthSignIn({
    env: options.env,
    openBrowser: start.openBrowser,
    fetch: platformFetch,
  });
  return createAccountProcedures({
    workspaceId: LOCAL_WORKSPACE,
    uow,
    connectAccount: new ConnectAccount({
      uow,
      secrets: start.secrets,
      clock,
      ids: { next: (prefix) => `${prefix}_${crypto.randomUUID()}` },
    }),
    // The first consent follows the recommended autonomy; Setup's choice later re-prompts when it needs more (ADR 0007).
    signIn: (signal) =>
      signIn.execute({ provider: "google", autonomy: DEFAULT_APP_SETTINGS.autonomy }, signal),
  });
};
