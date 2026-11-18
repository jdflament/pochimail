import type { RpcClient } from "../../../shared/ipc/client.ts";

/** Normalizes a worker client that may be provided eagerly or as a promise. */
export const resolveWorkerClient = (client: RpcClient | Promise<RpcClient>): Promise<RpcClient> =>
  Promise.resolve(client);
