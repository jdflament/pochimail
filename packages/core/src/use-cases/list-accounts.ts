import type { Account } from "../domain/account.ts";
import type { StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AsyncResult } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

/** Connected accounts of a workspace. */
export class ListAccounts {
  constructor(private readonly deps: { readonly uow: UnitOfWork }) {}

  execute(workspaceId: WorkspaceId): AsyncResult<readonly Account[], StorageError> {
    return this.deps.uow.reads.accounts.list(workspaceId);
  }
}
