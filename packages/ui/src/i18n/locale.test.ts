import { describe, expect, it } from "vitest";
import { deviceLabel, localeFromLanguages } from "./locale.ts";

describe("locale resolution from the OS/app language list (P13)", () => {
  it("maps French and Japanese by language prefix (guards a regional tag falling back to English)", () => {
    expect(localeFromLanguages(["fr-FR"])).toBe("fr");
    expect(localeFromLanguages(["fr-CA"])).toBe("fr");
    expect(localeFromLanguages(["ja-JP"])).toBe("ja");
    expect(localeFromLanguages(["ja"])).toBe("ja");
  });

  it("follows preference order and ignores unsupported languages (guards de-DE winning over French)", () => {
    expect(localeFromLanguages(["en-US", "fr-FR"])).toBe("en");
    expect(localeFromLanguages(["fr-FR", "en-US"])).toBe("fr");
    expect(localeFromLanguages(["de-DE", "fr-FR"])).toBe("fr");
    expect(localeFromLanguages(["de-DE", "ja-JP"])).toBe("ja");
    expect(localeFromLanguages(["de-DE", "en-GB"])).toBe("en");
  });

  it("handles uppercase and underscore tags from the OS (guards 'FR_fr' defaulting to English)", () => {
    expect(localeFromLanguages(["FR"])).toBe("fr");
    expect(localeFromLanguages(["JA_jp"])).toBe("ja");
  });

  it("falls back to English on an empty or missing list (guards a crash at boot)", () => {
    expect(localeFromLanguages([])).toBe("en");
    expect(localeFromLanguages(undefined)).toBe("en");
  });

  it("labels the unnamed host in the active language (guards 'votre computer' in French copy)", () => {
    expect(deviceLabel("computer", "fr")).toBe("ordinateur");
    expect(deviceLabel("computer", "ja")).toBe("パソコン");
    expect(deviceLabel("computer", "en")).toBe("computer");
    expect(deviceLabel("Mac", "ja")).toBe("Mac");
    expect(deviceLabel("PC", "fr")).toBe("PC");
  });
});
