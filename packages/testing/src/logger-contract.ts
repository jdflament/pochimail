import type { Logger, LogRecord, LogSink } from "@pochimail/core/logger";
import { describe, expect, it } from "vitest";

/**
 * Contract every Logger implementation must satisfy. Adapters (M2) call this with a factory
 * that builds their logger around the given sink. Each test is named after the leak it prevents.
 */
export function loggerContract(name: string, make: (sink: LogSink) => Logger): void {
  const capture = () => {
    const records: LogRecord[] = [];
    return { records, logger: make({ write: (r) => records.push(r) }) };
  };
  const dump = (records: LogRecord[]) => JSON.stringify(records);

  describe(`${name} (Logger contract)`, () => {
    it("leak: an email address in a message or field value", () => {
      const { records, logger } = capture();
      logger.info("sync failed for jane.doe@example.com", {
        accountId: "reply to bob@example.org",
      });
      expect(dump(records)).not.toMatch(/@example/);
    });

    it("leak: an email address used as a field key", () => {
      const { records, logger } = capture();
      logger.info("counts", { "jane@example.com": 1 });
      expect(dump(records)).not.toMatch(/jane|example/);
    });

    it("leak: subject and body fields, however they are cased or nested", () => {
      const { records, logger } = capture();
      logger.info("classified", {
        subject: "Your invoice",
        body: "Dear Jane",
        nested: { Subject: "x1y2" },
      });
      expect(dump(records)).not.toMatch(/invoice|Dear Jane|x1y2/);
    });

    it("leak: unlisted free-text keys (senderName, preview, content)", () => {
      const { records, logger } = capture();
      logger.info("seen", {
        senderName: "Jane Doe",
        preview: "Hi there",
        content: "secret plans",
        list: ["Hello Jane"],
      });
      expect(dump(records)).not.toMatch(/Jane|Hi there|secret plans|Hello/);
    });

    it("leak: bearer token and JWT in free text", () => {
      const { records, logger } = capture();
      logger.error("failed: Authorization: Bearer abc.def-123", {
        detail: "eyJhbGciOi.eyJzdWIiOi.sig_nature",
      });
      expect(dump(records)).not.toMatch(/abc\.def|eyJ/);
    });

    it("leak: access_token=… and other key=value secrets in a message", () => {
      const { records, logger } = capture();
      logger.error(
        "GET /cb?access_token=opaque123&state=ok refresh_token: 'r3fr3sh' client_secret=s3cr3t",
      );
      expect(dump(records)).not.toMatch(/opaque123|r3fr3sh|s3cr3t/);
    });

    it("leak: 'Authorization: token ghp_…' and bare provider token prefixes", () => {
      const { records, logger } = capture();
      const ghp = `ghp_${"a1B2".repeat(6)}`;
      const ya = "ya29.a0AfH6SMBx-y_z";
      logger.error(`Authorization: token ${ghp}`);
      logger.error(
        `got ${ya} then xoxb-1234567890-abcdef and sk-${"q".repeat(24)} and 1//0gLongRefreshTokenValue123`,
      );
      expect(dump(records)).not.toMatch(/ghp_|ya29|xoxb|sk-q|1\/\/0g/);
    });

    it("leak: display name next to an address ('Jane Doe <jane@…>')", () => {
      const { records, logger } = capture();
      logger.info('from Jane Doe <jane@example.com> and "Roe, Rick" <rick@example.org>');
      expect(dump(records)).not.toMatch(/Jane|Doe|Roe|Rick|example/);
    });

    it("leak: obfuscated or encoded addresses (%40, (at), [at])", () => {
      const { records, logger } = capture();
      logger.info("a jane%40example.com b jane(at)example.com c rick [at] example [dot] org");
      expect(dump(records)).not.toMatch(/jane|rick|example/i);
    });

    it("leak: PII inside an Error message", () => {
      const { records, logger } = capture();
      logger.error("failed", { cause: new Error("bad address jane@example.com") });
      expect(dump(records)).not.toMatch(/jane|example\.com/);
    });

    it("leak: bound child fields skip redaction", () => {
      const { records, logger } = capture();
      logger.child({ from: "jane@example.com", accountId: "acc-1" }).info("hello");
      expect(dump(records)).not.toMatch(/jane/);
      expect(records[0]?.fields.accountId).toBe("acc-1");
    });

    it("usefulness: ids, counts and codes stay readable, even ones containing 'mail' or 'text'", () => {
      const { records, logger } = capture();
      logger.warn("batch done", {
        count: 3,
        accountId: "acc-1",
        mailboxId: "mbx-9",
        code: "provider.offline",
        ok: true,
        context: 4,
      });
      expect(records[0]).toEqual({
        level: "warn",
        message: "batch done",
        fields: {
          count: 3,
          accountId: "acc-1",
          mailboxId: "mbx-9",
          code: "provider.offline",
          ok: true,
          context: 4,
        },
      });
    });

    it("over-redaction: a repeated (non-cyclic) reference keeps its safe values both times", () => {
      const { records, logger } = capture();
      const shared = { count: 2 };
      logger.info("twice", { a: shared, b: shared });
      expect(records[0]?.fields).toEqual({ a: { count: 2 }, b: { count: 2 } });
    });

    it("leak: circular or very deep fields throw or leak", () => {
      const { records, logger } = capture();
      const loop: Record<string, unknown> = { who: "jane@example.com" };
      loop.self = loop;
      expect(() => logger.info("cycle", { loop })).not.toThrow();
      expect(dump(records)).not.toMatch(/jane/);
    });
  });
}
