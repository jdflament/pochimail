import { z } from "zod";
import { parseJsonObject } from "./http.ts";

/** Provider token responses are an untrusted boundary: only these fields are read (AGENTS §4). */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  error: z.string().optional(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const parseTokenResponse = (body: string): TokenResponse | null => {
  const parsed = tokenResponseSchema.safeParse(parseJsonObject(body));
  return parsed.success ? parsed.data : null;
};

const DEFAULT_TOKEN_LIFETIME_S = 3600;

/** `expires_in` is a relative lifetime; the store keeps absolute times so a clock change is visible. */
export const expiresAtFrom = (response: TokenResponse, now: Date): string => {
  const seconds = Number(response.expires_in ?? DEFAULT_TOKEN_LIFETIME_S);
  const lifetime = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_TOKEN_LIFETIME_S;
  return new Date(now.getTime() + lifetime * 1000).toISOString();
};

/** The granted scopes, space-separated in an OAuth response; the requested ones when omitted. */
export const scopeList = (
  response: TokenResponse,
  fallback: readonly string[],
): readonly string[] => {
  const raw = response.scope?.trim() ?? "";
  if (raw.length === 0) return fallback;
  return raw.split(/\s+/).filter((scope) => scope.length > 0);
};
