import { z } from "zod";
import { parseJsonObject } from "./http.ts";

/** Provider token responses are an untrusted boundary: only these fields are read (AGENTS §4). */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().min(1).optional(),
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

/**
 * The address the user signed in as, from the OpenID `email` claim. The id token arrives straight from the
 * token endpoint over TLS, so reading its claims without checking a signature is what OpenID Connect allows.
 */
export const addressFromIdToken = (response: TokenResponse): string | undefined => {
  const payload = response.id_token?.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const claims = z
      .object({ email: z.email() })
      .safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return claims.success ? claims.data.email.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};
