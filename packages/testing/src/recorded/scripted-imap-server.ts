import { createServer, type Server, type Socket } from "node:net";
import { splitMboxRaw, unquoteFromLines } from "../fixture-mailbox/mbox.ts";

// DEV/TEST ONLY. A scripted IMAP server for the subset imapflow needs: CAPABILITY, LOGIN, LIST,
// SELECT/EXAMINE (with QRESYNC), NOOP, UID FETCH (CHANGEDSINCE), UID STORE, UID MOVE, IDLE,
// CLOSE, LOGOUT. It listens on 127.0.0.1 only, on a random port, and serves synthetic mail.

export const FIXTURE_IMAP_USER = "pochi.demo@example.com";
export const FIXTURE_IMAP_PASSWORD = "fixture-password"; // synthetic: the server accepts only this

interface Stored {
  uid: number;
  raw: string; // CRLF line ends
  flags: Set<string>;
  modseq: number;
  internalDate: string;
}

interface Folder {
  name: string;
  uidValidity: number;
  uidNext: number;
  messages: Stored[];
  /** UIDs that left the folder, with the modseq at which they did (for QRESYNC VANISHED). */
  vanished: { uid: number; modseq: number }[];
}

export interface ScriptedImapServer {
  readonly host: "127.0.0.1";
  readonly port: number;
  /** Mail arriving after start: IDLE sessions get an EXISTS push. */
  deliver(raw: string, flags?: readonly string[]): number;
  /** The mailbox was rebuilt: every cached UID is meaningless (the "expired cursor" of IMAP). */
  changeUidValidity(folder?: string): void;
  /** The server kills the socket instead of answering the next `count` commands. */
  dropConnections(count?: number): void;
  flagsOf(uid: number, folder?: string): readonly string[] | undefined;
  folderUids(folder: string): readonly number[];
  /** Number of client sockets currently open (0 after every session logged out or was dropped). */
  openConnections(): number;
  /** Total sockets ever accepted: 0 proves a client never reached the server. */
  connectionsAccepted(): number;
  close(): Promise<void>;
}

export interface ScriptedImapOptions {
  /** An mbox from the fixture mailbox generator; `>From ` escaping is undone here. */
  readonly mbox: string;
  readonly folders?: readonly string[];
}

const toCrlf = (text: string): string => unquoteFromLines(text).replace(/\r?\n/g, "\r\n");
const quote = (text: string): string => `"${text.replace(/["\\]/g, "\\$&")}"`;
const dateOf = (raw: string): string => {
  const header = /^date:\s*(.+)$/im.exec(raw)?.[1] ?? "Mon, 1 Jan 2026 00:00:00 +0000";
  const d = new Date(Date.parse(header));
  const pad = (n: number) => String(n).padStart(2, "0");
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][d.getUTCMonth()];
  return `${pad(d.getUTCDate())}-${month}-${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
};

/** `1:*`, `3,5:7`, `*`: expands against the UIDs that exist. */
const expandSet = (set: string, uids: readonly number[]): number[] => {
  const max = uids.reduce((a, b) => Math.max(a, b), 0);
  const bound = (v: string) => (v === "*" ? max : Number(v));
  const wanted = new Set<number>();
  for (const part of set.split(",")) {
    const [a = "", b] = part.split(":");
    const lo = bound(a);
    const hi = b === undefined ? lo : bound(b);
    for (const uid of uids) if (uid >= Math.min(lo, hi) && uid <= Math.max(lo, hi)) wanted.add(uid);
  }
  return [...wanted].sort((x, y) => x - y);
};

export async function startScriptedImapServer(
  options: ScriptedImapOptions,
): Promise<ScriptedImapServer> {
  const names = options.folders ?? ["INBOX", "Archive"];
  let highestModseq = 1;
  const folders = new Map<string, Folder>(
    names.map((name, index) => [
      name,
      { name, uidValidity: 1000 + index, uidNext: 1, messages: [], vanished: [] },
    ]),
  );
  const inbox = folders.get("INBOX");
  if (!inbox) throw new Error("A scripted IMAP server needs an INBOX");

  const append = (folder: Folder, raw: string, flags: Iterable<string>): Stored => {
    const stored: Stored = {
      uid: folder.uidNext++,
      raw,
      flags: new Set(flags),
      modseq: ++highestModseq,
      internalDate: dateOf(raw),
    };
    folder.messages.push(stored);
    return stored;
  };
  for (const raw of splitMboxRaw(options.mbox)) {
    const seen = /^status:.*R/im.test(raw);
    append(inbox, `${toCrlf(raw).replace(/\r\n$/, "")}\r\n`, seen ? ["\\Seen"] : []);
  }

  const sockets = new Set<Socket>();
  let accepted = 0;
  const idlers = new Set<{ socket: Socket; folder: Folder }>();
  let drops = 0;

  const server: Server = createServer((socket) => {
    accepted++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    const session = { authed: false, selected: null as Folder | null, qresync: false };
    let buffer = "";
    let idleTag: string | null = null;
    const send = (line: string) => socket.write(`${line}\r\n`);

    const fetchLine = (m: Stored, items: string[], withUid: boolean): string => {
      const parts: string[] = [];
      if (withUid) parts.push(`UID ${m.uid}`);
      let literal = "";
      for (const item of items) {
        const name = item.toUpperCase();
        if (name === "FLAGS") parts.push(`FLAGS (${[...m.flags].join(" ")})`);
        else if (name === "INTERNALDATE") parts.push(`INTERNALDATE "${m.internalDate}"`);
        else if (name === "MODSEQ") parts.push(`MODSEQ (${m.modseq})`);
        else if (name === "RFC822.SIZE") parts.push(`RFC822.SIZE ${m.raw.length}`);
        else if (name.startsWith("BODY.PEEK[HEADER") || name.startsWith("BODY[HEADER")) {
          const head = `${m.raw.slice(0, m.raw.indexOf("\r\n\r\n"))}\r\n\r\n`;
          literal += ` BODY[HEADER] {${head.length}}\r\n${head}`;
        } else if (name === "BODY.PEEK[]" || name === "BODY[]" || name === "RFC822")
          literal += ` BODY[] {${m.raw.length}}\r\n${m.raw}`;
      }
      return `(${parts.join(" ")}${literal})`;
    };

    const handle = (tag: string, command: string, args: string) => {
      const folderArg = () => {
        const name = args.trim().split(/\s+/)[0]?.replace(/^"|"$/g, "") ?? "";
        return folders.get(name);
      };
      switch (command) {
        case "CAPABILITY":
          send("* CAPABILITY IMAP4rev1 CONDSTORE QRESYNC ENABLE IDLE MOVE UIDPLUS");
          return send(`${tag} OK CAPABILITY completed`);
        case "ENABLE":
          session.qresync = /QRESYNC/i.test(args);
          send("* ENABLED QRESYNC CONDSTORE");
          return send(`${tag} OK ENABLE completed`);
        case "LOGIN": {
          const [user, pass] = [...args.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
          if (user !== FIXTURE_IMAP_USER || pass !== FIXTURE_IMAP_PASSWORD)
            return send(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials`);
          session.authed = true;
          return send(`${tag} OK LOGIN completed`);
        }
        case "NOOP":
          return send(`${tag} OK NOOP completed`);
        case "LOGOUT":
          send("* BYE Logging out");
          send(`${tag} OK LOGOUT completed`);
          return socket.end();
      }
      if (!session.authed) return send(`${tag} NO Authenticate first`);

      switch (command) {
        case "LIST":
          for (const f of folders.values()) send(`* LIST (\\HasNoChildren) "/" ${quote(f.name)}`);
          return send(`${tag} OK LIST completed`);
        case "SELECT":
        case "EXAMINE": {
          const folder = folderArg();
          if (!folder) return send(`${tag} NO [NONEXISTENT] No such folder`);
          session.selected = folder;
          send(`* ${folder.messages.length} EXISTS`);
          send("* 0 RECENT");
          send("* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)");
          send(`* OK [UIDVALIDITY ${folder.uidValidity}] UIDs valid`);
          send(`* OK [UIDNEXT ${folder.uidNext}] Predicted next UID`);
          send(`* OK [HIGHESTMODSEQ ${highestModseq}] Highest`);
          const resume = /QRESYNC \((\d+) (\d+)/i.exec(args);
          if (resume && Number(resume[1]) === folder.uidValidity) {
            const since = Number(resume[2]);
            const gone = folder.vanished.filter((v) => v.modseq > since).map((v) => v.uid);
            if (gone.length > 0) send(`* VANISHED (EARLIER) ${gone.join(",")}`);
            for (const m of folder.messages.filter((x) => x.modseq > since))
              send(
                `* ${folder.messages.indexOf(m) + 1} FETCH ${fetchLine(m, ["FLAGS", "MODSEQ"], true)}`,
              );
          }
          return send(`${tag} OK [READ-WRITE] ${command} completed`);
        }
        case "CLOSE":
          session.selected = null;
          return send(`${tag} OK CLOSE completed`);
        case "IDLE":
          if (!session.selected) return send(`${tag} BAD Select a folder first`);
          idleTag = tag;
          idlers.add({ socket, folder: session.selected });
          return send("+ idling");
        case "UID": {
          const folder = session.selected;
          if (!folder) return send(`${tag} BAD Select a folder first`);
          const match = /^(\w+)\s+(\S+)\s*(.*)$/s.exec(args);
          const sub = match?.[1]?.toUpperCase();
          const set = match?.[2] ?? "";
          const rest = match?.[3] ?? "";
          const uids = expandSet(
            set,
            folder.messages.map((m) => m.uid),
          );
          if (sub === "FETCH") {
            const items = /^\(([^)]*)\)/.exec(rest)?.[1] ?? rest.split(/\s+/)[0] ?? "";
            const since = /CHANGEDSINCE (\d+)/i.exec(rest)?.[1];
            const list = items.split(/\s+/).filter(Boolean);
            if (since !== undefined && !list.some((i) => i.toUpperCase() === "MODSEQ"))
              list.push("MODSEQ");
            for (const m of folder.messages) {
              if (!uids.includes(m.uid) || (since !== undefined && m.modseq <= Number(since)))
                continue;
              send(`* ${folder.messages.indexOf(m) + 1} FETCH ${fetchLine(m, list, true)}`);
            }
            return send(`${tag} OK UID FETCH completed`);
          }
          if (sub === "STORE") {
            const op = /^([+-]?)FLAGS(\.SILENT)?\s+\(([^)]*)\)/i.exec(rest);
            if (!op) return send(`${tag} BAD Unsupported STORE`);
            const flags = (op[3] ?? "").split(/\s+/).filter(Boolean);
            for (const m of folder.messages) {
              if (!uids.includes(m.uid)) continue;
              if (op[1] === "+") for (const f of flags) m.flags.add(f);
              else if (op[1] === "-") for (const f of flags) m.flags.delete(f);
              else m.flags = new Set(flags);
              m.modseq = ++highestModseq;
              if (!op[2])
                send(
                  `* ${folder.messages.indexOf(m) + 1} FETCH ${fetchLine(m, ["FLAGS", "MODSEQ"], true)}`,
                );
            }
            return send(`${tag} OK UID STORE completed`);
          }
          if (sub === "MOVE") {
            const target = folders.get(rest.trim().replace(/^"|"$/g, ""));
            if (!target) return send(`${tag} NO [TRYCREATE] No such folder`);
            const moved = folder.messages.filter((m) => uids.includes(m.uid));
            const copies = moved.map((m) => append(target, m.raw, m.flags));
            send(
              `* OK [COPYUID ${target.uidValidity} ${moved.map((m) => m.uid).join(",")} ${copies.map((c) => c.uid).join(",")}] Moved`,
            );
            highestModseq++;
            for (const m of moved) {
              const seq = folder.messages.indexOf(m) + 1;
              folder.messages.splice(seq - 1, 1);
              folder.vanished.push({ uid: m.uid, modseq: highestModseq });
              if (!session.qresync) send(`* ${seq} EXPUNGE`);
            }
            if (session.qresync && moved.length > 0)
              send(`* VANISHED ${moved.map((m) => m.uid).join(",")}`);
            return send(`${tag} OK UID MOVE completed`);
          }
          return send(`${tag} BAD Unsupported UID command`);
        }
        default:
          return send(`${tag} BAD Unknown command`);
      }
    };

    socket.write(
      "* OK [CAPABILITY IMAP4rev1 CONDSTORE QRESYNC IDLE MOVE] Scripted fixture ready\r\n",
    );
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      let end = buffer.indexOf("\r\n");
      while (end >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\r\n");
        if (idleTag !== null) {
          if (line.toUpperCase() === "DONE") {
            for (const idler of idlers) if (idler.socket === socket) idlers.delete(idler);
            send(`${idleTag} OK IDLE terminated`);
            idleTag = null;
          }
          continue;
        }
        if (drops > 0) {
          drops--;
          socket.destroy();
          return;
        }
        const match = /^(\S+)\s+(\S+)\s*(.*)$/.exec(line);
        if (match) handle(match[1] ?? "", (match[2] ?? "").toUpperCase(), match[3] ?? "");
      }
    });
    socket.on("close", () => {
      for (const idler of idlers) if (idler.socket === socket) idlers.delete(idler);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No port bound");

  return {
    host: "127.0.0.1",
    port: address.port,
    deliver: (raw, flags = []) => {
      const stored = append(inbox, `${toCrlf(raw).replace(/\r\n$/, "")}\r\n`, flags);
      for (const idler of idlers)
        if (idler.folder === inbox) idler.socket.write(`* ${inbox.messages.length} EXISTS\r\n`);
      return stored.uid;
    },
    changeUidValidity: (name = "INBOX") => {
      const folder = folders.get(name);
      if (folder) {
        folder.uidValidity += 100;
        folder.vanished = [];
      }
    },
    dropConnections: (count = 1) => {
      drops = count;
    },
    flagsOf: (uid, name = "INBOX") => {
      const m = folders.get(name)?.messages.find((x) => x.uid === uid);
      return m && [...m.flags].sort();
    },
    folderUids: (name) => folders.get(name)?.messages.map((m) => m.uid) ?? [],
    openConnections: () => sockets.size,
    connectionsAccepted: () => accepted,
    close: () =>
      new Promise<void>((resolve) => {
        const closing = [...sockets].map(
          (socket) => new Promise<void>((done) => socket.once("close", () => done())),
        );
        for (const socket of sockets) socket.destroy();
        server.close(() => void Promise.all(closing).then(() => resolve()));
      }),
  };
}
