import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { messages } from "./messages.ts";

const source = readFileSync(join(import.meta.dirname, "messages.ts"), "utf8");

describe("catalog copy (brief §6 › Voice, design › Writing)", () => {
  it("never writes 'mails' in the catalog (guards the old word creeping back)", () => {
    expect(source).not.toMatch(/\bmails\b/iu);
    expect(source).toMatch(/\bemails\b/);
  });

  it("uses {device} for the host instead of a literal Mac (guards copy that breaks on Windows)", () => {
    expect(source).toMatch(/\{device\}/);
    expect(source).not.toMatch(/this Mac/u);
    expect(messages["overview.promise.device"].params).toContain("device");
  });

  it("keeps screen titles functional and never ships placeholder tokens (guards greeting titles)", () => {
    expect(messages["overview.title"].text).toBe("Overview");
    for (const message of Object.values(messages)) expect(message.text).not.toMatch(/\[[A-Z]\]/u);
  });
});
