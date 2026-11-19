import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import type { Account } from "../domain/account.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

/** Connected accounts of a workspace. */
export class ListAccounts {
  constructor(private readonly deps: { readonly uow: UnitOfWork }) {}

  execute(workspaceId: WorkspaceId): AsyncResult<readonly Account[], StorageError> {
    return this.deps.uow.reads.accounts.list(workspaceId);
  }
}
