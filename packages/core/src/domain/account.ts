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
  /**
   * The OAuth scopes the provider granted (M2-05). Empty for app-password accounts. Kept so raising
   * autonomy knows whether a new consent is needed (`scopeUpgradeNeeded`).
   */
  grantedScopes: z.array(z.string()).default([]),
});
export type Account = z.infer<typeof accountSchema>;
