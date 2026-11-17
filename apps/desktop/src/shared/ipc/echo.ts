import { z } from "zod";

/** Echo RPC spoken between renderer and worker over a MessagePort (ADR 0002). Schemas are shared by both sides. */
export const echoRequestSchema = z.object({ id: z.number().int().nonnegative(), type: z.literal("echo"), text: z.string() });
export const echoResponseSchema = z.object({ id: z.number().int().nonnegative(), type: z.literal("echo"), text: z.string() });

export type EchoRequest = z.infer<typeof echoRequestSchema>;
export type EchoResponse = z.infer<typeof echoResponseSchema>;

/** The smallest surface the RPC needs from a MessagePort, so it works with DOM ports, MessagePortMain and test doubles. */
export type Transport = {
  post: (message: unknown) => void;
  onMessage: (handler: (data: unknown) => void) => void;
};

/** Worker side: answers every valid echo request, silently drops anything else. */
export const serveEcho = (transport: Transport): void => {
  transport.onMessage((data) => {
    const request = echoRequestSchema.safeParse(data);
    if (!request.success) return;
    const response: EchoResponse = { id: request.data.id, type: "echo", text: request.data.text };
    transport.post(response);
  });
};

/** Renderer side: correlates responses to requests by id and rejects when the worker stays silent. */
export const createEchoClient = (transport: Transport, timeoutMs = 5000) => {
  let nextId = 0;
  const pending = new Map<number, (text: string) => void>();

  transport.onMessage((data) => {
    const response = echoResponseSchema.safeParse(data);
    if (!response.success) return;
    pending.get(response.data.id)?.(response.data.text);
    pending.delete(response.data.id);
  });

  return {
    echo: (text: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("worker did not answer"));
        }, timeoutMs);
        pending.set(id, (reply) => {
          clearTimeout(timer);
          resolve(reply);
        });
        const request: EchoRequest = { id, type: "echo", text };
        transport.post(request);
      }),
  };
};
