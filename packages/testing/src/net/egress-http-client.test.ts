import { createHttpClient } from "@pochimail/net/egress/http-client";
import { registerHttpClientContract } from "@pochimail/testing/http-client-contract";

registerHttpClientContract(({ transport, allowlist, logger }) =>
  createHttpClient({ allowlist, fetch: transport, logger }),
);
