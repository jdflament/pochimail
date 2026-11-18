import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
  /** 43 characters from 32 random bytes (RFC 7636 allows 43–128). */
  readonly verifier: string;
  readonly challenge: string;
  readonly method: "S256";
}

/** Random bytes as base64url, the encoding PKCE and `state` use. */
export const randomToken = (bytes = 32, random: (size: number) => Buffer = randomBytes): string =>
  random(bytes).toString("base64url");

/**
 * A fresh PKCE verifier and its S256 challenge (ADR 0007). The verifier never leaves this process
 * except in the token exchange, and never reaches a log.
 */
export const createPkce = (random: (size: number) => Buffer = randomBytes): PkcePair => {
  const verifier = randomToken(32, random);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
};
