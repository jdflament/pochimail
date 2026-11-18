// DEV/TEST ONLY. Fixtures are never shipped in a production build (see fixtures-not-shipped.test.ts).

export interface ScrubFinding {
  readonly kind: "address" | "token";
  /** The offending text, trimmed to 12 characters so a failure never echoes a whole secret. */
  readonly excerpt: string;
}

const ADDRESS = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/** Reserved or obviously invented documentation domains: the only domains a fixture may mention. */
const isFixtureDomain = (domain: string): boolean => {
  const labels = domain.toLowerCase().split(".");
  const last = labels[labels.length - 1];
  const parent = labels[labels.length - 2];
  // `example` as a TLD, or as the second-level label under any TLD (example.com, example.jp).
  return last === "example" || parent === "example";
};

const TOKEN_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/,
  /\bya29\.[A-Za-z0-9._-]{8,}/, // Google access token
  /\b1\/\/[A-Za-z0-9._-]{20,}/, // Google refresh token
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/, // JWT (Microsoft tokens)
  /\b(?:sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{16,}/,
  /\b(?:refresh_token|access_token|client_secret|password)"?\s*[:=]\s*"?[A-Za-z0-9._~+/-]{12,}/i,
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])/, // any long opaque run
];

const excerpt = (text: string): string => text.slice(0, 12);

/** Everything in `text` that looks like a real address or a credential. Empty means clean. */
export function findScrubViolations(text: string): ScrubFinding[] {
  const findings: ScrubFinding[] = [];
  for (const match of text.matchAll(ADDRESS)) {
    const domain = match[1];
    if (domain !== undefined && !isFixtureDomain(domain))
      findings.push({ kind: "address", excerpt: excerpt(match[0]) });
  }
  for (const pattern of TOKEN_PATTERNS) {
    const match = pattern.exec(text);
    if (match) findings.push({ kind: "token", excerpt: excerpt(match[0]) });
  }
  return findings;
}

/** Throws when a fixture is not safe to commit. The message never contains the full secret. */
export function assertScrubbed(name: string, text: string): void {
  const findings = findScrubViolations(text);
  if (findings.length === 0) return;
  const list = findings.map((f) => `${f.kind} "${f.excerpt}…"`).join(", ");
  throw new Error(`Fixture "${name}" is not scrubbed: ${list}`);
}
