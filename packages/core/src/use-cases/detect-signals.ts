import type { Clock } from "../clock.ts";
import type { Account } from "../domain/account.ts";
import type { Category, SignalKind } from "../domain/category.ts";
import type { Message, StoredSignal } from "../domain/mail.ts";
import type { Cancelled, NotFound, StorageError } from "../errors.ts";
import type { DomainEventOf } from "../events/catalog.ts";
import type { AccountId, MessageId, WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { ReadRepositories } from "../ports/repositories.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { err, ok } from "../result.ts";

const DAY_MS = 86_400_000;
/** A thread we answered stays quiet this long before it counts as "waiting on them". */
export const WAITING_AFTER_DAYS = 3;
/** Unopened mail older than this is "old and never opened". */
export const OLD_AFTER_DAYS = 30;
/** A sender we replied to this often is important even without a VIP mark. */
export const IMPORTANT_REPLY_COUNT = 3;

// Word lists are deliberately small; the generative layer refines them later (brief §3).
const DOCUMENT_WORDS =
  /\b(invoice|receipt|contract|payslip|passport|statement|tax|facture|contrat|bulletin de paie|justificatif)\b|請求書|契約|領収書|給与明細/i;
const DEADLINE_WORDS =
  /\b(deadline|due|expires?|expiry|expiring|urgent|tomorrow|today|échéance|expire|urgent|demain)\b|期限|締切|明日/i;

export interface DetectSignalsDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface DetectSignalsRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  readonly messageIds: readonly MessageId[];
}

export type DetectSignalsError = StorageError | NotFound | Cancelled;

export type MessageSignal = StoredSignal;

/**
 * Evaluates the six signals for stored messages (brief §3). Reads headers, metadata and the
 * derived data only (category, short snippet); it never needs a body (proposed D11). Output is
 * sorted, so a given mailbox and clock always give the same answer. Each detection is announced
 * once through the outbox (`SignalDetected`, one stable id per message and kind).
 */
export class DetectSignals {
  constructor(private readonly deps: DetectSignalsDeps) {}

  async execute(
    request: DetectSignalsRequest,
    signal: CancelSignal,
  ): AsyncResult<readonly MessageSignal[], DetectSignalsError> {
    const { uow, clock } = this.deps;
    const detected = await evaluateSignals(uow.reads, clock, request);
    if (!detected.ok) return detected;

    // Re-detection keeps the first `detectedAt` of a signal that still applies, so rows are stable.
    const ids = [...request.messageIds];
    const before = await uow.reads.signals.listForMessages(request.workspaceId, ids);
    if (!before.ok) return before;
    const firstSeen = new Map(before.value.map((s) => [`${s.messageId}:${s.kind}`, s.detectedAt]));
    const rows = detected.value.map((s) => ({
      ...s,
      detectedAt: firstSeen.get(`${s.messageId}:${s.kind}`) ?? s.detectedAt,
    }));

    const committed = await uow.run(async (tx) => {
      const saved = await tx.repositories.signals.replaceForMessages(
        request.workspaceId,
        ids,
        rows,
      );
      if (!saved.ok) return saved;
      for (const s of rows) {
        const event = {
          id: `signal:${s.messageId}:${s.kind}`,
          type: "SignalDetected",
          version: 1,
          workspaceId: s.workspaceId,
          occurredAt: s.detectedAt,
          payload: { messageId: s.messageId, kind: s.kind, confidence: s.confidence },
        } satisfies DomainEventOf<"SignalDetected">;
        const appended = await tx.outbox.append({ kind: "event", event });
        if (!appended.ok) return appended;
      }
      return ok(undefined);
    }, signal);
    if (!committed.ok) return committed;
    return ok(rows);
  }

  /** What an earlier `execute` stored, read back without evaluating anything again. */
  async stored(request: DetectSignalsRequest): AsyncResult<readonly MessageSignal[], StorageError> {
    return this.deps.uow.reads.signals.listForMessages(request.workspaceId, request.messageIds);
  }
}

/** Shared with BuildDigest, which needs the signals but not the events. */
export async function evaluateSignals(
  reads: ReadRepositories,
  clock: Clock,
  request: DetectSignalsRequest,
): AsyncResult<MessageSignal[], StorageError | NotFound> {
  const { workspaceId: ws } = request;
  const account = await reads.accounts.get(ws, request.accountId);
  if (!account.ok) return account;
  const now = clock.now();
  const out: MessageSignal[] = [];

  for (const id of [...request.messageIds].sort()) {
    const message = await reads.messages.get(ws, id);
    if (!message.ok) return message;
    if (message.value.accountId !== request.accountId) continue;

    const derived = await reads.derived.get(ws, id);
    if (!derived.ok && derived.error.code !== "storage.not_found") return derived;
    const category = derived.ok ? derived.value.category : message.value.category;
    const text = `${message.value.subject} ${derived.ok ? derived.value.snippet : message.value.snippet}`;

    const stats = await reads.senders.get(ws, request.accountId, message.value.from);
    if (!stats.ok && stats.error.code !== "storage.not_found") return stats;
    const lastInThread = await isLastInThread(reads, message.value);
    if (!lastInThread.ok) return lastInThread;

    for (const hit of rules({
      message: message.value,
      category,
      text,
      owner: account.value,
      now,
      lastInThread: lastInThread.value,
      important: stats.ok && (stats.value.vip || stats.value.repliedCount >= IMPORTANT_REPLY_COUNT),
    })) {
      out.push({
        schemaVersion: 1,
        workspaceId: ws,
        messageId: id,
        kind: hit.kind,
        confidence: hit.confidence,
        detectedAt: now.toISOString(),
        reason: hit.reason,
      });
    }
  }
  return ok(out);
}

async function isLastInThread(reads: ReadRepositories, message: Message) {
  const thread = await reads.threads.get(message.workspaceId, message.threadId);
  if (!thread.ok) {
    // Threads are optional context: a message without a stored thread is a thread of one.
    return thread.error.code === "storage.not_found" ? ok(true) : err(thread.error);
  }
  return ok(thread.value.messageIds.at(-1) === message.id);
}

interface RuleInput {
  readonly message: Message;
  readonly category: Category;
  readonly text: string;
  readonly owner: Account;
  readonly now: Date;
  readonly lastInThread: boolean;
  readonly important: boolean;
}
interface Hit {
  readonly kind: SignalKind;
  readonly confidence: number;
  readonly reason: string;
}

function rules(i: RuleInput): Hit[] {
  const hits: Hit[] = [];
  const fromOwner = i.message.from.toLowerCase() === i.owner.address.toLowerCase();
  const ageDays = (i.now.getTime() - Date.parse(i.message.receivedAt)) / DAY_MS;

  if (i.category === "people" && i.lastInThread && !fromOwner)
    hits.push({
      kind: "needs-reply",
      confidence: 0.8,
      reason: "A person wrote last and you have not answered",
    });
  if (i.category === "people" && i.lastInThread && fromOwner && ageDays >= WAITING_AFTER_DAYS)
    hits.push({
      kind: "waiting-on-them",
      confidence: 0.8,
      reason: `You wrote last, ${WAITING_AFTER_DAYS}+ days ago, with no answer`,
    });
  if (i.important && !fromOwner)
    hits.push({
      kind: "important-sender",
      confidence: 0.9,
      reason: "You often reply to this sender or marked them VIP",
    });
  if (DOCUMENT_WORDS.test(i.text))
    hits.push({ kind: "has-document", confidence: 0.6, reason: "Looks like a document" });
  if (DEADLINE_WORDS.test(i.text))
    hits.push({ kind: "time-sensitive", confidence: 0.6, reason: "Mentions a deadline or expiry" });
  if (!i.message.opened && ageDays >= OLD_AFTER_DAYS)
    hits.push({
      kind: "old-never-opened",
      confidence: 0.95,
      reason: `Unopened for ${OLD_AFTER_DAYS}+ days`,
    });
  return hits;
}
