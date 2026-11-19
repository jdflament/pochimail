import { describe, expect, it } from "vitest";
import { createHostAllowlist } from "./allowlist.ts";

describe("host allow-list", () => {
  // Guards: a mis-set wildcard would turn the deny-by-default policy into allow-all for that suffix.
  it("rejects wildcard and path entries at configuration time", () => {
    expect(() => createHostAllowlist(["*.example.com"])).toThrow();
    expect(() => createHostAllowlist(["example.com/path"])).toThrow();
    expect(() => createHostAllowlist(["example.com"])).not.toThrow(); // exact portless hosts are fine
  });
});
