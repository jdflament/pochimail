import { err, ok, type Result } from "@pochimail/kernel/result";
import { z } from "zod";
import { SECRET_FAILURES, SecretStoreError } from "../secret-error.ts";
import type { Transport } from "./transport.ts";

/** The secret channel needs only two methods; RPC teardown hooks are not part of it. */
type SecretTransport = Pick<Transport, "post" | "onMessage">;

/**
 * Secret RPC between main (owns the keychain) and the worker, on its own MessagePort. It is never given to the
 * renderer: the page's port speaks echo only (ADR 0002, threat model).
 */
const requestSchema = z.discriminatedUnion("op", [
  z.object({ id: z.number().int().nonnegative(), op: z.literal("get"), key: z.string() }),
  z.object({
    id: z.number().int().nonnegative(),
    op: z.literal("set"),
    key: z.string(),
    value: z.string(),
  }),
  z.object({ id: z.number().int().nonnegative(), op: z.literal("remove"), key: z.string() }),
  z.object({ id: z.number().int().nonnegative(), op: z.literal("protection") }),
]);
const protectionSchema = z.discriminatedUnion("level", [
  z.object({ level: z.literal("os-keychain"), backend: z.string() }),
  z.object({ level: z.literal("basic-text") }),
  z.object({ level: z.literal("unavailable") }),
]);
const responseSchema = z.object({
  id: z.number().int().nonnegative(),
  ok: z.boolean(),
  value: z.union([z.string(), z.null(), protectionSchema]).optional(),
  reason: z.enum(SECRET_FAILURES).optional(),
});

export type ProtectionState = z.infer<typeof protectionSchema>;

type Service = {
  get: (key: string) => Promise<Result<string | null, SecretStoreError>>;
  set: (key: string, value: string) => Promise<Result<void, SecretStoreError>>;
  remove: (key: string) => Promise<Result<void, SecretStoreError>>;
  protection: () => Promise<ProtectionState>;
};

/** Main side: answers valid requests, drops anything else. */
export const serveSecrets = (transport: SecretTransport, service: Service): void => {
  transport.onMessage((data) => {
    const parsed = requestSchema.safeParse(data);
    if (!parsed.success) return;
    const request = parsed.data;
    const respond = async (): Promise<z.infer<typeof responseSchema>> => {
      if (request.op === "protection")
        return { id: request.id, ok: true, value: await service.protection() };
      const result =
        request.op === "get"
          ? await service.get(request.key)
          : request.op === "set"
            ? await service.set(request.key, request.value)
            : await service.remove(request.key);
      if (!result.ok) return { id: request.id, ok: false, reason: result.error.reason };
      return typeof result.value === "string" || result.value === null
        ? { id: request.id, ok: true, value: result.value }
        : { id: request.id, ok: true };
    };
    void respond()
      .catch(
        (): z.infer<typeof responseSchema> => ({
          id: request.id,
          ok: false,
          reason: "failed",
        }),
      )
      .then((response) => transport.post(response));
  });
};

/** Worker side: the client behind the `SecretStore` adapter. */
export const createSecretsClient = (transport: SecretTransport, timeoutMs = 10_000) => {
  let nextId = 0;
  const pending = new Map<number, (response: z.infer<typeof responseSchema>) => void>();
  transport.onMessage((data) => {
    const parsed = responseSchema.safeParse(data);
    if (parsed.success) pending.get(parsed.data.id)?.(parsed.data);
  });
  const call = (request: Record<string, unknown>): Promise<z.infer<typeof responseSchema>> => {
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ id, ok: false, reason: "unreachable" });
      }, timeoutMs);
      pending.set(id, (response) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(response);
      });
      transport.post({ id, ...request });
    });
  };
  const toResult = <T>(response: z.infer<typeof responseSchema>, value: T) =>
    response.ok ? ok(value) : err(new SecretStoreError(response.reason ?? "failed"));
  return {
    get: async (key: string) => {
      const response = await call({ op: "get", key });
      return toResult(response, typeof response.value === "string" ? response.value : null);
    },
    set: async (key: string, value: string) =>
      toResult(await call({ op: "set", key, value }), undefined),
    remove: async (key: string) => toResult(await call({ op: "remove", key }), undefined),
    protection: async (): Promise<ProtectionState> => {
      const parsed = protectionSchema.safeParse((await call({ op: "protection" })).value);
      return parsed.success ? parsed.data : { level: "unavailable" };
    },
  };
};
