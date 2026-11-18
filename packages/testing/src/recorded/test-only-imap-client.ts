import { connect, type Socket } from "node:net";
import type { IncomingMessage } from "@pochimail/core/domain/mail";
import { readMailbox } from "../fixture-mailbox/mailbox-reader.ts";
import { quoteFromLines } from "../fixture-mailbox/mbox.ts";
import type { MailboxIds } from "./http-wire.ts";
import { FIXTURE_IMAP_PASSWORD, FIXTURE_IMAP_USER } from "./scripted-imap-server.ts";

// TEST ONLY, NEVER A PRODUCTION IMAP CLIENT. A minimal plaintext client for the scripted server and
// a reference mailbox reader built on it. It has no TLS, no reconnect and no back-pressure; the
// real adapter (M2-11, imapflow) must not reuse it and runs `protocol-contract.ts` on its own code.

export interface ImapResponse {
  /** Untagged responses; literals are inlined as `{n}\r\n<bytes>` so callers can parse FETCH. */
  readonly untagged: readonly string[];
  readonly status: "OK" | "NO" | "BAD";
  readonly text: string;
}

export interface TestOnlyImapClient {
  command(line: string): Promise<ImapResponse>;
  /** Resolves with the next untagged line (e.g. an IDLE `EXISTS` push). */
  nextUntagged(): Promise<string>;
  /** Sends raw text with no tag (e.g. `DONE`). */
  raw(text: string): void;
  close(): void;
}

/** The M2-06 `HostAllowlist.assertSocketAllowed`: throws when the endpoint is not allowed. */
export type SocketGuard = (host: string, port: number) => void;

/** For tests of the scripted server alone, where no allow-list is under test. */
export const loopbackOnlyGuard: SocketGuard = (host) => {
  if (host !== "127.0.0.1") throw new Error("Test-only IMAP client talks to loopback only");
};

export interface TestOnlyImapOptions {
  /** Called before any socket is opened. Pass `allowlist.assertSocketAllowed` to prove egress. */
  readonly assertSocketAllowed: SocketGuard;
  readonly host?: string;
  /** Longest wait for the connection or for one response line. Default 5 s. */
  readonly timeoutMs?: number;
}

export async function connectTestOnlyImap(
  port: number,
  options: TestOnlyImapOptions,
): Promise<TestOnlyImapClient> {
  const host = options.host ?? "127.0.0.1";
  const timeoutMs = options.timeoutMs ?? 5_000;
  options.assertSocketAllowed(host, port);
  const socket: Socket = await new Promise((resolve, reject) => {
    const s = connect({ host, port }, () => {
      clearTimeout(timer);
      resolve(s);
    });
    const timer = setTimeout(() => {
      s.destroy();
      reject(new Error("Test-only IMAP connect timed out"));
    }, timeoutMs);
    s.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.setEncoding("latin1");
  let buffer = "";
  let closedError: Error | null = null;
  const waiters: (() => void)[] = [];
  const wake = () => {
    for (const waiter of waiters.splice(0)) waiter();
  };
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    wake();
  });
  socket.on("close", () => {
    closedError = new Error("IMAP connection closed");
    wake();
  });
  socket.on("error", () => {});

  /** One complete response line (literals inlined), or null while more bytes are due. */
  const take = (): string | null => {
    let position = 0;
    let out = "";
    for (;;) {
      const end = buffer.indexOf("\r\n", position);
      if (end < 0) return null;
      const line = buffer.slice(position, end);
      const literal = /\{(\d+)\}$/.exec(line);
      if (!literal) {
        buffer = buffer.slice(end + 2);
        return out + line;
      }
      const bodyStart = end + 2;
      const bodyEnd = bodyStart + Number(literal[1]);
      if (buffer.length < bodyEnd) return null;
      out += `${line}\r\n${buffer.slice(bodyStart, bodyEnd)}`;
      position = bodyEnd;
    }
  };

  const nextLine = async (): Promise<string> => {
    for (;;) {
      const line = take();
      if (line !== null) return line;
      if (closedError) throw closedError;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error("Test-only IMAP response timed out"));
        }, timeoutMs);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };

  let counter = 0;
  await nextLine(); // greeting
  return {
    raw: (text) => void socket.write(`${text}\r\n`),
    nextUntagged: async () => nextLine(),
    close: () => void socket.destroy(),
    async command(line) {
      const tag = `a${++counter}`;
      socket.write(`${tag} ${line}\r\n`);
      const untagged: string[] = [];
      for (;;) {
        const received = await nextLine();
        if (received.startsWith(`${tag} `)) {
          const [status = "BAD", ...text] = received.slice(tag.length + 1).split(" ");
          return { untagged, status: status as ImapResponse["status"], text: text.join(" ") };
        }
        untagged.push(received);
      }
    },
  };
}

const bodyOf = (fetchLine: string): string | undefined => {
  const m = /BODY\[\] \{(\d+)\}\r\n/.exec(fetchLine);
  if (!m) return undefined;
  const start = (m.index ?? 0) + m[0].length;
  return fetchLine.slice(start, start + Number(m[1]));
};

/** UID FETCH of every message in INBOX, parsed back into `IncomingMessage`s (flags decide `opened`). */
export async function readMailboxOverTestOnlyImap(
  port: number,
  ids: MailboxIds,
  options: TestOnlyImapOptions,
): Promise<IncomingMessage[]> {
  const client = await connectTestOnlyImap(port, options);
  try {
    const login = await client.command(`LOGIN "${FIXTURE_IMAP_USER}" "${FIXTURE_IMAP_PASSWORD}"`);
    if (login.status !== "OK") throw new Error("IMAP login refused");
    await client.command("SELECT INBOX");
    const fetched = await client.command("UID FETCH 1:* (UID FLAGS BODY.PEEK[])");
    if (fetched.status !== "OK") throw new Error(`UID FETCH failed: ${fetched.text}`);
    const out: IncomingMessage[] = [];
    for (const line of fetched.untagged) {
      const raw = bodyOf(line);
      if (raw === undefined) continue;
      const [parsed] = readMailbox(
        `From fixture\n${quoteFromLines(raw.replace(/\r\n/g, "\n"))}`,
        ids,
      );
      if (!parsed) continue;
      const seen = /FLAGS \([^)]*\\Seen/.test(line);
      out.push({ ...parsed.message, opened: seen });
    }
    return out;
  } finally {
    client.close();
  }
}
