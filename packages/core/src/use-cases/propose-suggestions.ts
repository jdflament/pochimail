import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, InvalidIdError, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import { type Command, createSuggestion, type Suggestion } from "../domain/action.ts";
import type { Category } from "../domain/category.ts";
import type { DerivedMessage } from "../domain/derived.ts";
import type { Message } from "../domain/mail.ts";
import type { InvalidStateError, NotFound } from "../errors.ts";
import type { DomainEventOf } from "../events/catalog.ts";
import { type AccountId, SuggestionId } from "../ids.ts";
import { isActionKind, PROTECTED_CATEGORIES } from "../policies/autonomy.ts";
import type { ReadRepositories } from "../ports/repositories.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

const PAGE = 200;
/** Never suggest from a sender with fewer emails than this: one email is not a pattern. */
export const MIN_SENDER_MESSAGES = 3;

export interface ProposeSuggestionsDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface ProposeSuggestionsRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
}

export type ProposeSuggestionsError =
  | StorageError
  | NotFound
  | Cancelled
  | InvalidIdError
  | InvalidStateError;

/** Categories where mail can be cleaned up; everything else is never proposed (brief §3). */
const CLEANABLE: readonly Category[] = ["newsletters", "promotions", "notifications"];

/**
 * Proposes sender-level clean-ups, each with a human-readable reason and a confidence (brief §3).
 *
 * Only archive and unsubscribe are ever proposed (never delete) and never for a sender who has
 * People mail, a protected category (brief §2). The reason and confidence come from what the
 * classifier recorded for the sender's messages. Re-running creates nothing twice and never
 * resets a suggestion the user already approved or dismissed.
 */
export class ProposeSuggestions {
  constructor(private readonly deps: ProposeSuggestionsDeps) {}

  async execute(
    request: ProposeSuggestionsRequest,
    signal: CancelSignal,
  ): AsyncResult<readonly Suggestion[], ProposeSuggestionsError> {
    const { uow, clock } = this.deps;
    const collected = await collect(uow.reads, request);
    if (!collected.ok) return collected;

    const createdAt = clock.now().toISOString();
    const proposals: Suggestion[] = [];
    for (const [sender, rows] of [...collected.value].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (rows.length < MIN_SENDER_MESSAGES) continue;
      if (rows.some((r) => PROTECTED_CATEGORIES.includes(r.message.category))) continue;
      if (!rows.every((r) => CLEANABLE.includes(r.message.category))) continue;
      const proposal = propose(rows);
      if (!proposal || !isActionKind(proposal.kind)) continue;
      const id = SuggestionId(`sug:${request.accountId}:${sender}:${proposal.kind}`);
      if (!id.ok) return id;
      const command: Command = { kind: proposal.kind, messageIds: rows.map((r) => r.message.id) };
      const made = createSuggestion({
        schemaVersion: 1,
        id: id.value,
        workspaceId: request.workspaceId,
        accountId: request.accountId,
        command,
        reasons: proposal.reasons,
        confidence: proposal.confidence,
        state: "pending",
        createdAt,
      });
      if (!made.ok) return err(made.error);
      proposals.push(made.value);
    }

    const created: Suggestion[] = [];
    const committed = await uow.run(async (tx) => {
      for (const s of proposals) {
        const existing = await tx.repositories.suggestions.get(s.workspaceId, s.id);
        if (existing.ok) continue;
        if (existing.error.code !== "storage.not_found") return existing;
        const saved = await tx.repositories.suggestions.save(s);
        if (!saved.ok) return saved;
        const event = {
          id: `suggestion:${s.id}`,
          type: "SuggestionCreated",
          version: 1,
          workspaceId: s.workspaceId,
          occurredAt: createdAt,
          payload: {
            suggestionId: s.id,
            accountId: s.accountId,
            kind: s.command.kind,
            messageCount: s.command.messageIds.length,
          },
        } satisfies DomainEventOf<"SuggestionCreated">;
        const appended = await tx.outbox.append({ kind: "event", event });
        if (!appended.ok) return appended;
        created.push(s);
      }
      return ok(undefined);
    }, signal);
    if (!committed.ok) return committed;
    return ok(created);
  }
}

interface Row {
  readonly message: Message;
  readonly derived: DerivedMessage | null;
}

async function collect(
  reads: ReadRepositories,
  request: ProposeSuggestionsRequest,
): AsyncResult<Map<string, Row[]>, StorageError | NotFound> {
  const bySender = new Map<string, Row[]>();
  let cursor: string | undefined;
  do {
    const page = await reads.messages.query(request.workspaceId, {
      accountId: request.accountId,
      limit: PAGE,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!page.ok) return page;
    for (const message of page.value.items) {
      const derived = await reads.derived.get(request.workspaceId, message.id);
      if (!derived.ok && derived.error.code !== "storage.not_found") return derived;
      const rows = bySender.get(message.from) ?? [];
      rows.push({ message, derived: derived.ok ? derived.value : null });
      bySender.set(message.from, rows);
    }
    cursor = page.value.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return ok(bySender);
}

function propose(rows: readonly Row[]) {
  const unopened = rows.every((r) => !r.message.opened);
  const confidence = Math.min(0.99, ...rows.map((r) => r.derived?.confidence ?? 0.5));
  const why = [...new Set(rows.flatMap((r) => (r.derived ? [r.derived.reason] : [])))];
  const evidence = `${rows.length} emails from this sender, ${unopened ? "none" : "some"} opened`;
  if (unopened && rows.every((r) => r.message.hasListUnsubscribe))
    return {
      kind: "unsubscribe" as const,
      confidence,
      reasons: [evidence, ...why],
    };
  if (unopened)
    return { kind: "archive" as const, confidence: confidence * 0.9, reasons: [evidence, ...why] };
  return null;
}
