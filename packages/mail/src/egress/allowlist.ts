import type { AccountId } from "@pochimail/core/ids";

/** Lowercase and drop one trailing dot so DNS spellings cannot evade an exact match. */
export const canonicalHost = (host: string): string => {
  const lower = host.toLowerCase();
  return lower.length > 1 && lower.endsWith(".") ? lower.slice(0, -1) : lower;
};

/**
 * Always-on hosts from `docs/security/network.md` rows H1–H5. Exact names only: no wildcards,
 * no suffix matching. X1 (one-click unsubscribe) is a separate, dedicated path (M5).
 */
export const STATIC_EGRESS_HOSTS: readonly string[] = [
  "gmail.googleapis.com", // H1: Gmail API
  "oauth2.googleapis.com", // H2, H3: Google token and revocation endpoints
  "graph.microsoft.com", // H4: Graph mail API
  "login.microsoftonline.com", // H5: Microsoft token endpoint
];

export interface EgressEndpoint {
  readonly host: string;
  readonly port: number;
}

/** The IMAP/SMTP endpoints of one account the user connected (H6, H7). */
export interface AccountEgressHosts {
  readonly accountId: AccountId;
  readonly imap: EgressEndpoint;
  readonly smtp?: EgressEndpoint;
}

/**
 * One egress policy, used by the worker's HTTP client and the Electron session filter.
 * Account hosts are added on connect and revoked on account removal.
 */
export interface HostAllowlist {
  /** Fresh `host[:port]` snapshot; safe to hand to the session request filter. */
  hosts(): readonly string[];
  /** Registers (or replaces) the endpoints of one connected account. */
  addAccount(hosts: AccountEgressHosts): void;
  /** Revokes every endpoint of one account. Safe for unknown ids. */
  removeAccount(accountId: AccountId): void;
  /** Exact host and, where recorded, port match. Never a suffix or wildcard match. */
  allows(rawUrl: string | URL): boolean;
  /** Exact host:port check for raw IMAP/SMTP sockets (H6, H7). */
  allowsSocket(host: string, port: number): boolean;
  /** The guard IMAP/SMTP clients must call before opening a socket; throws when blocked. */
  assertSocketAllowed(host: string, port: number): void;
}

/** Typed failure of the socket guard: no address, credentials or message content is carried. */
export class BlockedSocketError extends Error {
  readonly kind = "socket-blocked" as const;
  readonly host: string;
  readonly port: number;

  constructor(host: string, port: number) {
    super("Outbound socket to a host outside the allow-list was blocked");
    this.name = "BlockedSocketError";
    this.host = canonicalHost(host);
    this.port = port;
  }
}

const normaliseHost = (raw: string): string => {
  const host = canonicalHost(raw.trim());
  if (host === "" || host.includes("*") || /\s/.test(host))
    throw new Error("Invalid egress host: expected one exact host name");
  let parsed: URL;
  try {
    parsed = new URL(`https://${host}`);
  } catch {
    throw new Error("Invalid egress host: expected one exact host name");
  }
  // Rejects credentials, paths, embedded ports and anything else that is not just a host.
  if (canonicalHost(parsed.hostname) !== host)
    throw new Error("Invalid egress host: expected one exact host name");
  return host;
};

const endpointEntry = (endpoint: EgressEndpoint): string => {
  const host = normaliseHost(endpoint.host);
  const { port } = endpoint;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid egress port: expected 1–65535");
  return `${host}:${port}`;
};

/** Bad input to the socket guard is blocked, not a configuration crash in the caller. */
const tryEndpointEntry = (endpoint: EgressEndpoint): string | undefined => {
  try {
    return endpointEntry(endpoint);
  } catch {
    return undefined;
  }
};

const splitEntry = (entry: string): { host: string; port: string | undefined } => {
  if (entry.startsWith("[")) {
    const close = entry.indexOf("]");
    if (close === -1) return { host: entry, port: undefined };
    const tail = entry.slice(close + 1);
    return {
      host: entry.slice(0, close + 1),
      port: tail.startsWith(":") ? tail.slice(1) : undefined,
    };
  }
  const colon = entry.indexOf(":");
  return colon === -1
    ? { host: entry, port: undefined }
    : { host: entry.slice(0, colon), port: entry.slice(colon + 1) };
};

const defaultPort = (protocol: string): string => {
  if (protocol === "http:") return "80";
  if (protocol === "https:") return "443";
  return "";
};

/** Shared matcher: the session filter and the worker client cannot drift apart. */
export const matchesAllowlistEntry = (entry: string, url: URL): boolean => {
  const { host, port } = splitEntry(entry);
  if (canonicalHost(url.hostname) !== host) return false;
  if (port === undefined) return url.port === "";
  const effectivePort = url.port === "" ? defaultPort(url.protocol) : url.port;
  return effectivePort === port;
};

const NETWORK_PROTOCOLS = new Set(["http:", "https:", "imap:", "imaps:", "smtp:", "smtps:"]);

export const createHostAllowlist = (
  staticHosts: readonly string[] = STATIC_EGRESS_HOSTS,
): HostAllowlist => {
  const staticEntries = staticHosts.map(normaliseHost);
  const accounts = new Map<string, readonly string[]>();
  const entries = (): readonly string[] => [
    ...staticEntries,
    ...[...accounts.keys()].sort().flatMap((id) => accounts.get(id) ?? []),
  ];

  return {
    hosts: () => [...entries()],
    addAccount: ({ accountId, imap, smtp }) => {
      const accountEntries = [endpointEntry(imap)];
      if (smtp !== undefined) accountEntries.push(endpointEntry(smtp));
      accounts.set(accountId, accountEntries);
    },
    removeAccount: (accountId) => {
      accounts.delete(accountId);
    },
    allows: (rawUrl) => {
      let url: URL;
      try {
        url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
      } catch {
        return false;
      }
      if (url.hostname === "" || !NETWORK_PROTOCOLS.has(url.protocol)) return false;
      return entries().some((entry) => matchesAllowlistEntry(entry, url));
    },
    allowsSocket: (host, port) => {
      const entry = tryEndpointEntry({ host, port });
      return entry !== undefined && entries().includes(entry);
    },
    assertSocketAllowed: (host, port) => {
      const entry = tryEndpointEntry({ host, port });
      if (entry === undefined || !entries().includes(entry))
        throw new BlockedSocketError(host, port);
    },
  };
};

/**
 * The one policy source for every process: the same static hosts and normalisation. Main's session
 * filter and each worker client create their own instance here; account endpoints are registered
 * on both when accounts connect and revoked on both when they are removed.
 */
export const egressPolicy = {
  staticHosts: STATIC_EGRESS_HOSTS,
  create: (): HostAllowlist => createHostAllowlist(STATIC_EGRESS_HOSTS),
} as const;
