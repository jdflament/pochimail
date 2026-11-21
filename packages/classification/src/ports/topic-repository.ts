import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { TopicId, WorkspaceId } from "@pochimail/kernel/ids";
import type { Topic } from "../model/topic.ts";

export interface TopicReader {
  get(ws: WorkspaceId, id: TopicId): AsyncResult<Topic, StorageError | NotFound>;
  list(ws: WorkspaceId): AsyncResult<readonly Topic[], StorageError>;
}
export interface TopicWriter {
  save(topic: Topic): AsyncResult<void, StorageError>;
}
export type TopicRepository = TopicReader & TopicWriter;
