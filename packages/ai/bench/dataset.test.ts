import { describe, expect, it } from "vitest";
import { buildDataset, categories, languages } from "./dataset.ts";

describe("benchmark dataset", () => {
  const emails = buildDataset();

  // Guards: a skewed set would let a model look good by ignoring a language or category.
  it("has ~200 emails, balanced over every category and language", () => {
    expect(emails).toHaveLength(210);
    for (const category of categories) for (const language of languages) {
      expect(emails.filter((e) => e.category === category && e.language === language)).toHaveLength(10);
    }
  });

  // Guards: a leftover placeholder or ground-truth mismatch would silently corrupt extraction scores.
  it("fills every placeholder and keeps deadline ground truth ISO-shaped", () => {
    for (const e of emails) {
      expect(`${e.subject}${e.from}${e.snippet}`, e.id).not.toMatch(/\{[a-z]+\}/);
      if (e.deadline !== null) expect(e.deadline, e.id).toMatch(/^2027-\d{2}-\d{2}$/);
    }
    expect(emails.some((e) => e.deadline === null)).toBe(true);
    expect(emails.some((e) => e.deadline !== null)).toBe(true);
  });

  // Guards: AGENTS.md §5, no real addresses in fixtures.
  it("only uses reserved example domains", () => {
    for (const e of emails) {
      for (const [, domain] of e.from.matchAll(/@([^>\s]+)/g)) expect(domain, e.id).toMatch(/^(example\.(com|org|net)|[a-z]+\.example)$/);
    }
  });

  it("is deterministic", () => {
    expect(buildDataset()).toEqual(emails);
  });
});
