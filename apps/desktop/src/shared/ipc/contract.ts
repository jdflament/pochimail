import { categorySchema } from "@pochimail/core/domain/category";
import { AUTONOMY_LEVELS } from "@pochimail/core/policies/autonomy";
import { DEVICE_NAMES } from "@pochimail/core/ports/platform";
import { CAPABILITIES } from "@pochimail/core/ports/settings-store";
import { z } from "zod";

/**
 * The typed contract every screen uses (ADR 0002, M4-01). Handlers backed by core use cases live in worker/handlers.ts (M4-02).
 * Nothing here carries message bodies (D11): the renderer only ever sees counts, ids, states and progress.
 */
const accountId = z.string().min(1).max(200);
const jobId = z.string().min(1).max(200);
const actionId = z.string().min(1).max(200);

const autonomySchema = z.enum(AUTONOMY_LEVELS);
const capabilitiesSchema = z.object(
  Object.fromEntries(CAPABILITIES.map((name) => [name, z.boolean()])) as Record<
    (typeof CAPABILITIES)[number],
    z.ZodBoolean
  >,
);

const queries = {
  "accounts.list": {
    input: z.undefined(),
    output: z
      .array(
        z.object({
          id: accountId,
          provider: z.enum(["google", "microsoft", "imap"]),
          displayName: z.string().max(200),
        }),
      )
      .max(100),
  },
  /** The Overview's figures, for every account or the one named; counts only, never content. */
  "overview.get": {
    input: z.object({ accountId: accountId.optional() }),
    output: z.object({
      scanned: z.number().int().nonnegative(),
      toReview: z.number().int().nonnegative(),
      waiting: z.number().int().nonnegative(),
      deadlines: z.number().int().nonnegative(),
      important: z.number().int().nonnegative(),
      oldestWaitingDays: z.number().int().nonnegative(),
      cleanable: z
        .array(
          z.object({
            category: z.enum(["newsletters", "promotions", "notifications", "sign-ins-security"]),
            count: z.number().int().nonnegative(),
          }),
        )
        .max(4),
    }),
  },
  /** Email counts per category over the given accounts (the switcher's selection); counts only, never content. */
  "mailbox.categories": {
    input: z.object({ accountIds: z.array(accountId).max(100) }),
    output: z.record(categorySchema, z.number().int().nonnegative()),
  },
  /** Read-only: the live (running or paused) scan jobs of the given accounts, so a screen can show Pause or Resume after a reload. */
  "scan.status": {
    input: z.object({ accountIds: z.array(accountId).max(100) }),
    output: z
      .array(
        z.object({
          accountId,
          jobId,
          status: z.enum(["running", "paused"]),
          processed: z.number().int().nonnegative(),
        }),
      )
      .max(100),
  },
  "digest.get": {
    input: z.undefined(),
    output: z.object({ ready: z.boolean(), itemCount: z.number().int().nonnegative() }),
  },
  "settings.get": {
    input: z.undefined(),
    output: z.object({
      autonomy: autonomySchema,
      capabilities: capabilitiesSchema,
      notifications: z.boolean(),
    }),
  },
  "app.state": {
    input: z.undefined(),
    output: z.object({
      status: z.enum(["starting", "ready", "locked"]),
      hasConnectedAccount: z.boolean(),
    }),
  },
  /** M4-07: copy uses deviceName(), never a hard-coded OS name (brief §5.9). */
  "device.name": {
    input: z.undefined(),
    output: z.enum(DEVICE_NAMES),
  },
} as const;

const mutations = {
  "scan.start": {
    input: z.object({ accountId }),
    output: z.object({ jobId }),
  },
  "scan.pause": {
    input: z.object({ jobId }),
    output: z.undefined(),
  },
  "scan.resume": {
    input: z.object({ jobId }),
    output: z.undefined(),
  },
  /** Stops the scan for good; starting again continues from where the stored cursor stopped. */
  "scan.cancel": {
    input: z.object({ jobId }),
    output: z.undefined(),
  },
  "settings.update": {
    input: z.object({
      autonomy: autonomySchema.optional(),
      capabilities: capabilitiesSchema.optional(),
      notifications: z.boolean().optional(),
    }),
    output: z.undefined(),
  },
} as const;

/** `coalesceKey` names the field whose value identifies "the same state": only the latest event per key is kept in a buffer. */
const subscriptions = {
  "scan.progress": {
    input: z.object({ accountId }),
    event: z.object({
      accountId,
      phase: z.enum(["listing", "fetching", "classifying", "done"]),
      processed: z.number().int().nonnegative(),
      /** `null` while the provider cannot say how many emails there are. */
      total: z.number().int().nonnegative().nullable(),
    }),
    coalesceKey: (event: { accountId: string }) => event.accountId,
  },
  "app.events": {
    input: z.undefined(),
    event: z.discriminatedUnion("type", [
      z.object({ type: z.literal("ActionApplied"), actionId }),
      z.object({
        type: z.literal("ActionFailed"),
        actionId,
        reason: z.enum(["not-found", "conflict", "provider-error", "cancelled", "unknown"]),
      }),
      z.object({
        type: z.literal("ScanCompleted"),
        accountId,
        processed: z.number().int().nonnegative(),
      }),
      z.object({
        type: z.literal("ScanFailed"),
        accountId,
        reason: z.enum(["offline", "rate-limited", "auth-expired", "unknown"]),
      }),
      z.object({ type: z.literal("DigestReady"), itemCount: z.number().int().nonnegative() }),
      // Required-state triggers (M4-16). M2/M3/M8 emit the real events; fixtures emit them until then.
      z.object({ type: z.literal("Offline") }),
      z.object({ type: z.literal("Online") }),
      z.object({
        type: z.literal("RateLimited"),
        provider: z.string().min(1),
        /** Epoch milliseconds when sync resumes by itself. */
        resumeAt: z.number().int().nonnegative(),
      }),
      z.object({ type: z.literal("SyncResumed") }),
      z.object({ type: z.literal("NeedsReauth"), accountId, provider: z.string().min(1) }),
      z.object({ type: z.literal("Reconnected"), accountId }),
      z.object({ type: z.literal("ModelDownloadFailed") }),
      z.object({ type: z.literal("ModelDownloadStarted") }),
      z.object({ type: z.literal("UpdateReady"), version: z.string().min(1) }),
    ]),
    coalesceKey: undefined,
  },
} as const;

type Queries = typeof queries;
type Mutations = typeof mutations;
type Subscriptions = typeof subscriptions;
export type ProcedureName = keyof Queries | keyof Mutations;
export type SubscriptionName = keyof Subscriptions;

export type InputOf<N extends ProcedureName> = N extends keyof Queries
  ? z.input<Queries[N]["input"]>
  : N extends keyof Mutations
    ? z.input<Mutations[N]["input"]>
    : never;
export type OutputOf<N extends ProcedureName> = N extends keyof Queries
  ? z.output<Queries[N]["output"]>
  : N extends keyof Mutations
    ? z.output<Mutations[N]["output"]>
    : never;
export type SubInputOf<N extends SubscriptionName> = z.input<Subscriptions[N]["input"]>;
export type EventOf<N extends SubscriptionName> = z.output<Subscriptions[N]["event"]>;

/** Looks a procedure up by name; queries and mutations share one namespace. */
export const procedureSchemas = (name: string) => {
  if (Object.hasOwn(queries, name)) return queries[name as keyof Queries];
  if (Object.hasOwn(mutations, name)) return mutations[name as keyof Mutations];
  return undefined;
};
export const subscriptionSchemas = (name: string) =>
  Object.hasOwn(subscriptions, name) ? subscriptions[name as SubscriptionName] : undefined;
