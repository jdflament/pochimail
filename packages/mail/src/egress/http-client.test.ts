import { createHttpClient } from "./http-client.ts";
import { registerHttpClientContract } from "./http-client-contract.ts";

registerHttpClientContract(({ transport, allowlist, logger }) =>
  createHttpClient({ allowlist, fetch: transport, logger }),
);
