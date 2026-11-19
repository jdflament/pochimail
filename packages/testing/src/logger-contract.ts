import type { Logger, LogRecord, LogSink } from "@pochimail/logger/logger";
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
        detail: "eyJFAKE.eyJFAKE.FAKE_sig",
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
      const ghp = "ghp_FAKEFAKEFAKEFAKEFAKE";
      const ya = "ya29.FAKE-fake_fake";
      logger.error(`Authorization: token ${ghp}`);
      logger.error(
        `got ${ya} then xoxb-FAKE-FAKE-FAKE and sk-FAKE_FAKE_FAKE_FAKE and 1//FAKE_FAKE_FAKE_FAKE_FAKE`,
      );
      expect(dump(records)).not.toMatch(/ghp_|ya29|xoxb|sk-FAKE|1\/\/FAKE/);
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

    it("leak: a token in a thrown Error's message, code or cause chain", () => {
      const { records, logger } = capture();
      const cause = new Error("upstream said Bearer FAKE_cause_token_123");
      const thrown = Object.assign(
        new Error("refresh failed access_token=FAKE_msg_token_123", { cause }),
        {
          code: "ghp_FAKEFAKEFAKEFAKEFAKE",
        },
      );
      logger.error("request failed", { err: thrown, cause: thrown.cause, errors: [thrown] });
      expect(dump(records)).not.toMatch(/FAKE_cause|FAKE_msg|ghp_FAKE|FAKEFAKE/);
    });

    it("leak: PII inside an Error message", () => {
      const { records, logger } = capture();
      logger.error("failed", { cause: new Error("bad address jane@example.com") });
      expect(dump(records)).not.toMatch(/jane|example\.com/);
    });

    it("leak: bound child fields skip redaction", () => {
      const { records, logger } = capture();
      logger
        .child({ from: "jane@example.com", accountId: "acc_01ARZ3NDEKTSV4RRFFQ69G5FAV" })
        .info("hello");
      expect(dump(records)).not.toMatch(/jane/);
      expect(records[0]?.fields.accountId).toBe("acc_01ARZ3NDEKTSV4RRFFQ69G5FAV");
    });

    it("leak: an OAuth code in a query string (code=…)", () => {
      const { records, logger } = capture();
      logger.error("GET /cb?code=4/0AFAKEcode&scope=mail");
      expect(dump(records)).not.toMatch(/0AFAKE/);
    });

    it("leak: a Cookie header value", () => {
      const { records, logger } = capture();
      logger.error("sent Cookie: sid=FAKEsession123; theme=dark");
      expect(dump(records)).not.toMatch(/FAKEsession|sid=/);
    });

    it("leak: an opaque value under a secret-looking key, whatever the value", () => {
      const { records, logger } = capture();
      logger.error("auth failed", {
        Authorization: "FAKEopaqueSecret123",
        sessionId: "FAKEsess",
        authCode: 42,
      });
      expect(dump(records)).not.toMatch(/FAKE|42/);
    });

    it("leak: Slack xoxd-/xoxc- tokens", () => {
      const { records, logger } = capture();
      logger.error("cookie jar xoxd-FAKEFAKEFAKE and xoxc-FAKEFAKEFAKE");
      expect(dump(records)).not.toMatch(/xox[dc]/);
    });

    it("leak: Stripe sk_live_/rk_test_ keys and AWS ASIA keys", () => {
      const { records, logger } = capture();
      logger.error("keys sk_live_FAKEFAKEFAKE rk_test_FAKEFAKEFAKE ASIAFAKEFAKEFAKEFAKE");
      expect(dump(records)).not.toMatch(/sk_live|rk_test|ASIA/);
    });

    it("leak: a token glued to a word (AUTH_ghp_…)", () => {
      const { records, logger } = capture();
      logger.error("env AUTH_ghp_FAKEFAKEFAKEFAKEFAKE set");
      expect(dump(records)).not.toMatch(/ghp_|FAKEFAKE/);
    });

    it("leak: a token split by a soft hyphen (ghp_ + U+00AD)", () => {
      const { records, logger } = capture();
      logger.error("token gh\u00adp_FAKEFAKEFAKEFAKEFAKE");
      expect(dump(records)).not.toMatch(/FAKEFAKE/);
    });

    it("leak: a repeatedly percent-encoded address (%252540)", () => {
      const { records, logger } = capture();
      logger.info("to jane%252540example.com and rick%25252540example.org");
      expect(dump(records)).not.toMatch(/jane|rick|example/);
    });

    it("leak: a fullwidth-@ address (NFKC)", () => {
      const { records, logger } = capture();
      logger.info("to jane\uff20example.com");
      expect(dump(records)).not.toMatch(/jane|example/);
    });

    it("leak: an HTML-entity address (&#64; and &commat;)", () => {
      const { records, logger } = capture();
      logger.info("to jane&#64;example.com and rick&commat;example.org");
      expect(dump(records)).not.toMatch(/jane|rick|example/);
    });

    it("leak: an address without a TLD (root@corp)", () => {
      const { records, logger } = capture();
      logger.info("from root@corp");
      expect(dump(records)).not.toMatch(/root|corp/);
    });

    it("leak: PII in an Error name and stack", () => {
      const { records, logger } = capture();
      const e = new Error("x");
      e.name = "NotFound: jane@example.com";
      e.stack = "NotFound: jane@example.com\n    at fn (file.ts:1:1) rick@example.org";
      logger.error("failed", { err: e });
      expect(dump(records)).not.toMatch(/jane|rick|example/);
    });

    it("leak: a name stored under a safe key (subjectId, kind, ids[])", () => {
      const { records, logger } = capture();
      logger.info("seen", {
        subjectId: "Jane Doe",
        kind: "Jane Doe",
        ids: ["Jane Doe", "acc_01ARZ3NDEKTSV4RRFFQ69G5FAV"],
        count: "Jane Doe",
        code: "Jane Doe",
      });
      expect(dump(records)).not.toMatch(/Jane|Doe/);
      expect(records[0]?.fields.ids).toEqual(["[redacted]", "acc_01ARZ3NDEKTSV4RRFFQ69G5FAV"]);
    });

    it("leak: ReDoS - 100 KB adversarial input must log in under 50 ms", () => {
      const { logger } = capture();
      const inputs = [
        "a".repeat(100_000),
        "&#'x".repeat(25_000),
        `token=${" ".repeat(100_000)}`,
        "@".repeat(100_000),
        `${"a ".repeat(50_000)}<x@y>`,
      ];
      for (const input of inputs) {
        const started = performance.now();
        logger.info(input, { detail: input });
        expect(performance.now() - started).toBeLessThan(50);
      }
    });

    it("leak: an over-long string is replaced by a truncation marker, not logged", () => {
      const { records, logger } = capture();
      logger.info(`jane@example.com ${"x ".repeat(5000)}`);
      expect(records[0]?.message).toMatch(/^\[truncated \d+ chars\]$/);
    });

    it("leak: a base64-encoded address and opaque tokens in free text", () => {
      const { records, logger } = capture();
      logger.info("to amFuZUBleGFtcGxlLmNvbQ== via FAKEopaqueTokenValue1234567890");
      expect(dump(records)).not.toMatch(/amFuZU|FAKEopaque/);
    });

    it("leak: binary contents (Buffer, TypedArray, ArrayBuffer, DataView)", () => {
      const { records, logger } = capture();
      const bytes = new TextEncoder().encode("jane@example.com");
      logger.info("blob", {
        a: bytes,
        b: bytes.buffer,
        c: new DataView(bytes.buffer),
        d: new Float64Array(2),
      });
      expect(dump(records)).not.toMatch(/jane|example|106|97/);
      expect(records[0]?.fields.a).toBe("[binary 16 bytes]");
    });

    it("leak: Map and Set entries are redacted, not dropped or dumped", () => {
      const { records, logger } = capture();
      logger.info("collections", {
        m: new Map([["jane@example.com", "Jane Doe"]]),
        s: new Set(["rick@example.org", "Rick"]),
      });
      expect(dump(records)).not.toMatch(/jane|Jane|rick|Rick|example/);
      expect(dump(records)).not.toBe("{}");
    });

    it("leak: a plain-word address ('jane at example dot com')", () => {
      const { records, logger } = capture();
      logger.info("to jane at example dot com and Rick AT Example DOT org");
      expect(dump(records)).not.toMatch(/jane|rick|example/i);
    });

    it("leak: look-alike values under id keys ('JaneDoe', 'jane.doe', an unprefixed ULID)", () => {
      const { records, logger } = capture();
      logger.info("seen", {
        accountId: "JaneDoe",
        messageId: "jane.doe",
        threadId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        actionId: "act_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      });
      expect(records[0]?.fields).toEqual({
        accountId: "[redacted]",
        messageId: "[redacted]",
        threadId: "[redacted]",
        actionId: "act_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      });
    });

    it("leak: an arbitrary dotted string under the code key (only the closed set passes)", () => {
      const { records, logger } = capture();
      logger.info("failed", { code: "jane.doe" });
      logger.info("failed", { code: "ECONNRESET" });
      logger.info("failed", { code: "provider.offline" });
      expect(records.map((r) => r.fields.code)).toEqual([
        "[redacted]",
        "[redacted]",
        "provider.offline",
      ]);
    });

    it("leak: numbers under non-numeric keys (code, pin, phoneNumber)", () => {
      const { records, logger } = capture();
      logger.info("seen", {
        code: 482913,
        pin: 4821,
        phoneNumber: 15551234567,
        status: 404,
        durationMs: 12,
      });
      expect(records[0]?.fields).toEqual({
        code: "[redacted]",
        pin: "[redacted]",
        phoneNumber: "[redacted]",
        status: 404,
        durationMs: 12,
      });
    });

    it("leak: spaced and plain-word addresses without a dot word", () => {
      const { records, logger } = capture();
      logger.info(
        "a jane @ example.com b rick@ example.org c sam at example.com d lee at gmail.com",
      );
      expect(dump(records)).not.toMatch(/jane|rick|sam|lee|example|gmail/);
    });

    it('leak: a quoted local part ("jane doe"@example.com)', () => {
      const { records, logger } = capture();
      logger.info('to "jane doe"@example.com and "Rick Roe"@example.org');
      expect(dump(records)).not.toMatch(/jane|doe|rick|roe|example/);
    });

    it("leak: a huge array is capped with a marker", () => {
      const { records, logger } = capture();
      const started = performance.now();
      logger.info("many", { ids: Array.from({ length: 100_000 }, () => "x") });
      expect(performance.now() - started).toBeLessThan(50);
      const ids = records[0]?.fields.ids as unknown[];
      expect(ids).toHaveLength(51);
      expect(ids.at(-1)).toBe("[+99950 more]");
    });

    it("usefulness: ids, counts and codes stay readable, even ones containing 'mail' or 'text'", () => {
      const { records, logger } = capture();
      logger.warn("batch done", {
        count: 3,
        accountId: "acc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        mailboxId: "mbx_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        code: "provider.offline",
        ok: true,
        size: 4,
      });
      expect(records[0]).toEqual({
        level: "warn",
        message: "batch done",
        fields: {
          count: 3,
          accountId: "acc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
          mailboxId: "mbx_01ARZ3NDEKTSV4RRFFQ69G5FAW",
          code: "provider.offline",
          ok: true,
          size: 4,
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
