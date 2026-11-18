import type { Message } from "@pochimail/core/domain/mail";
import type { StorageError } from "@pochimail/core/errors";
import type { AsyncResult } from "@pochimail/core/ports/common";
import type { ReadRepositories, WriteRepositories } from "@pochimail/core/ports/repositories";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { createSqliteCore } from "./sqlite-core.ts";

/** Full-text search over metadata and derived data (sender, subject, snippet, category, signals). */
export interface MessageSearch {
  /** Best match first; the last word may be a prefix. Never matches message bodies: none are stored. */
  search(
    ws: Message["workspaceId"],
    accountId: Message["accountId"],
    text: string,
    limit: number,
  ): AsyncResult<readonly Message[], StorageError>;
}

/** Repositories bound to one connection; every query is parameterised and workspace-scoped. */
export function createSqliteRepositories(db: Database): {
  reads: ReadRepositories;
  writes: WriteRepositories;
  search: MessageSearch;
} {
  const core = createSqliteCore(db);
  // The core is synchronous (better-sqlite3 is); the ports are async.
  const lift =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A) =>
      Promise.resolve(fn(...args));

  const accounts = {
    get: lift(core.accounts.get),
    list: lift(core.accounts.list),
  };
  const messages = {
    get: lift(core.messages.get),
    query: lift(core.messages.query),
    latestSequence: lift(core.messages.latestSequence),
  };
  const derived = { get: lift(core.derived.get), list: lift(core.derived.list) };
  const threads = { get: lift(core.threads.get) };
  const senders = { get: lift(core.senders.get), list: lift(core.senders.list) };
  const suggestions = {
    get: lift(core.suggestions.get),
    listPending: lift(core.suggestions.listPending),
  };
  const actionLog = {
    get: lift(core.actionLog.get),
    listForAction: lift(core.actionLog.listForAction),
    listForKey: lift(core.actionLog.listForKey),
    listForBatch: lift(core.actionLog.listForBatch),
    list: lift(core.actionLog.list),
  };
  const topics = { get: lift(core.topics.get), list: lift(core.topics.list) };
  const cursors = { get: lift(core.cursors.get) };
  const signals = { listForMessages: lift(core.signals.listForMessages) };
  const digestState = {
    get: lift(core.digestState.get),
    getSequence: lift(core.digestState.getSequence),
  };

  const reads: ReadRepositories = {
    accounts,
    messages,
    threads,
    derived,
    senders,
    suggestions,
    actionLog,
    topics,
    cursors,
    signals,
    digestState,
  };
  const writes: WriteRepositories = {
    accounts: { ...accounts, save: lift(core.accounts.save), remove: lift(core.accounts.remove) },
    messages: {
      ...messages,
      upsertMany: lift(core.messages.upsertMany),
      setCategory: lift(core.messages.setCategory),
    },
    threads: { ...threads, upsert: lift(core.threads.upsert) },
    derived: { ...derived, save: lift(core.derived.save) },
    senders: { ...senders, upsert: lift(core.senders.upsert) },
    suggestions: { ...suggestions, save: lift(core.suggestions.save) },
    actionLog: { ...actionLog, append: lift(core.actionLog.append) },
    topics: { ...topics, save: lift(core.topics.save) },
    cursors: { ...cursors, set: lift(core.cursors.set) },
    signals: { ...signals, replaceForMessages: lift(core.signals.replaceForMessages) },
    digestState: { ...digestState, set: lift(core.digestState.set) },
  };
  return { reads, writes, search: { search: lift(core.search) } };
}
