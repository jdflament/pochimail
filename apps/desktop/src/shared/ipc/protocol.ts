import { z } from "zod";

/** Typed failure shared by both sides. Codes are stable: the UI branches on them, never on messages. */
const rpcErrorCodeSchema = z.enum([
  "OVERFLOW",
  "BAD_INPUT",
  "BAD_OUTPUT",
  "UNKNOWN_PROCEDURE",
  "NOT_IMPLEMENTED",
  "HANDLER_FAILED",
  "TIMEOUT",
  "CLOSED",
]);
export type RpcErrorCode = z.infer<typeof rpcErrorCodeSchema>;

export class RpcError extends Error {
  readonly code: RpcErrorCode;
  constructor(code: RpcErrorCode, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

/** Largest message either side accepts (serialized characters). Far above any real batch; stops a hostile page or worker from forcing huge allocations. */
const MAX_MESSAGE_CHARS = 1_000_000;
export const withinMessageLimit = (data: unknown): boolean => {
  try {
    return (JSON.stringify(data)?.length ?? 0) <= MAX_MESSAGE_CHARS;
  } catch {
    return false; // cyclic or unserializable: not one of ours
  }
};

const name = z.string().min(1).max(100);
const message = z.string().max(500);
const id = z.number().int().nonnegative();

/** Messages the renderer sends. `input` is validated again against the procedure's schema by the worker. */
export const clientMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("call"), id, procedure: name, input: z.unknown() }),
  z.object({ kind: z.literal("subscribe"), id, topic: name, input: z.unknown() }),
  z.object({ kind: z.literal("unsubscribe"), id }),
  z.object({ kind: z.literal("ack") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** Messages the worker sends. A batch carries many events; the envelope is validated once, each payload by its topic schema. */
export const serverMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("result"), id, output: z.unknown() }),
  z.object({
    kind: z.literal("failure"),
    id,
    error: z.object({ code: rpcErrorCodeSchema, message }),
  }),
  z.object({
    kind: z.literal("batch"),
    events: z.array(z.object({ sub: id, data: z.unknown() })),
  }),
  z.object({
    kind: z.literal("subscription-error"),
    sub: id,
    error: z.object({ code: rpcErrorCodeSchema, message }),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
