import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { ThreadId, WorkspaceId } from "@pochimail/kernel/ids";
import type { Thread } from "../model/thread.ts";

export interface ThreadReader {
  get(ws: WorkspaceId, id: ThreadId): AsyncResult<Thread, StorageError | NotFound>;
}
export interface ThreadWriter {
  upsert(thread: Thread): AsyncResult<void, StorageError>;
}

export type ThreadRepository = ThreadReader & ThreadWriter;
