import type { AsyncResult, Page, PageRequest } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import type { Suggestion, SuggestionId } from "../model/suggestion.ts";

// Every method takes the workspaceId first: all reads and writes are workspace-scoped.

export interface SuggestionReader {
  get(ws: WorkspaceId, id: SuggestionId): AsyncResult<Suggestion, StorageError | NotFound>;
  listPending(ws: WorkspaceId, page: PageRequest): AsyncResult<Page<Suggestion>, StorageError>;
}
export interface SuggestionWriter {
  save(suggestion: Suggestion): AsyncResult<void, StorageError>;
}
export type SuggestionRepository = SuggestionReader & SuggestionWriter;
