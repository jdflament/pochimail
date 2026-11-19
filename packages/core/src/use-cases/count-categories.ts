import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import type { Category } from "../domain/category.ts";
import type { AccountId } from "../ids.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

/** Counts only: emails per category for the selected accounts, from one aggregate read (the sidebar's numbers). */
export class CountCategories {
  constructor(private readonly deps: { readonly uow: UnitOfWork }) {}

  execute(
    workspaceId: WorkspaceId,
    accountIds: readonly AccountId[],
  ): AsyncResult<Readonly<Record<Category, number>>, StorageError> {
    return this.deps.uow.reads.messages.countByCategory(workspaceId, accountIds);
  }
}
