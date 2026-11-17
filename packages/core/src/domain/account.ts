import { z } from "zod";
import { accountIdSchema, schemaVersion, timestampSchema, workspaceIdSchema } from "./common.ts";

export const PROVIDER_KINDS = ["gmail", "graph", "imap"] as const;
export const providerKindSchema = z.enum(PROVIDER_KINDS);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const accountSchema = z.object({
  schemaVersion,
  id: accountIdSchema,
  workspaceId: workspaceIdSchema,
  provider: providerKindSchema,
  address: z.email(),
  connectedAt: timestampSchema,
});
export type Account = z.infer<typeof accountSchema>;
