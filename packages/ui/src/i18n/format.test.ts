import { describe, expect, it } from "vitest";
import { t } from "./format.ts";

describe("t() (design › Writing, P13)", () => {
  it("formats zero, one and many emails with the right English plural (guards '1 emails')", () => {
    expect(t("overview.email.count", { count: 0 })).toBe("No emails");
    expect(t("overview.email.count", { count: 1 })).toBe("1 email");
    expect(t("overview.email.count", { count: 1240 })).toBe("1,240 emails");
  });

  it("groups numbers in the clean-up headline (guards raw 3100 leaking into copy)", () => {
    expect(t("overview.size.free", { size: 3100, total: 6400 })).toBe(
      "3,100 GB you can free, out of 6,400 GB",
    );
  });

  it("substitutes the device name from the port, never a hard-coded Mac (guards Windows copy)", () => {
    expect(t("overview.sorting", { device: "PC" })).toBe("Sorting privately on this PC");
    expect(t("overview.promise.device", { device: "computer" })).toBe(
      "Your email never leaves this computer.",
    );
  });

  it("produces long accented pseudo-locale copy for expansion stories (guards untested FR/JA layout)", () => {
    const english = "Sorting privately on this Mac";
    const pseudo = t("overview.sorting", { device: "Mac" }, { locale: "pseudo" });
    expect(pseudo).toMatch(/[äëïöüÿ]/u);
    expect(pseudo.length).toBeGreaterThan(english.length * 1.5);
  });
});
