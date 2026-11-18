import { AccountId } from "@pochimail/core/ids";
import { unwrap } from "@pochimail/core/result";
import { describe, expect, it } from "vitest";
import { BlockedSocketError, createHostAllowlist, egressPolicy } from "./allowlist.ts";

describe("host allow-list", () => {
  // Guards: one account's removal must not silently open or close another account's egress.
  it("keeps a shared host allowed while another account using it is removed", () => {
    const allowlist = createHostAllowlist();
    const shared = unwrap(AccountId("acc-shared"));
    const removed = unwrap(AccountId("acc-removed"));
    const endpoint = { host: "imap.example.com", port: 993 };
    allowlist.addAccount({ accountId: shared, imap: endpoint });
    allowlist.addAccount({
      accountId: removed,
      imap: endpoint,
      smtp: { host: "smtp.example.com", port: 587 },
    });

    allowlist.removeAccount(removed);

    expect(() => allowlist.assertSocketAllowed("imap.example.com", 993)).not.toThrow();
    expect(() => allowlist.assertSocketAllowed("smtp.example.com", 587)).toThrow(
      BlockedSocketError,
    );
    expect(allowlist.hosts()).toEqual([
      "gmail.googleapis.com",
      "oauth2.googleapis.com",
      "graph.microsoft.com",
      "login.microsoftonline.com",
      "imap.example.com:993",
    ]);
  });

  // Guards: a mis-set wildcard would turn the deny-by-default policy into allow-all for that suffix.
  it("rejects wildcard and path entries at configuration time", () => {
    expect(() => createHostAllowlist(["*.example.com"])).toThrow();
    expect(() => createHostAllowlist(["example.com/path"])).toThrow();
    expect(() => createHostAllowlist(["example.com"])).not.toThrow(); // exact portless hosts are fine
  });

  // Guards: a malformed socket endpoint must be refused, not handed to a socket library.
  it("blocks a malformed socket endpoint through the guard", () => {
    const allowlist = egressPolicy.create();
    expect(allowlist.allowsSocket("*.example.com", 993)).toBe(false);
    expect(() => allowlist.assertSocketAllowed("*.example.com", 993)).toThrow(BlockedSocketError);
  });
});
