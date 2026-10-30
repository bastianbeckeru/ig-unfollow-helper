import { afterEach, describe, expect, it } from "vitest";
import { type Key, language, STRINGS, setLanguage, t } from "./i18n";
import type { Language } from "./types";

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n", () => {
  afterEach(() => setLanguage("en"));

  it("has the same placeholders in every language", () => {
    for (const key of Object.keys(STRINGS.en) as Key[]) {
      for (const lang of Object.keys(STRINGS) as Language[]) {
        expect(STRINGS[lang][key], `${lang} ${key}`).toBeTruthy();
        expect(placeholders(STRINGS[lang][key]), `${lang} ${key}`).toEqual(
          placeholders(STRINGS.en[key]),
        );
      }
    }
  });

  it("defaults to English and fills placeholders", () => {
    expect(language()).toBe("en");
    expect(t("ago.min", { count: 5 })).toBe("5 min ago");
  });

  it("switches language and reports changes", () => {
    expect(setLanguage("es")).toBe(true);
    expect(setLanguage("es")).toBe(false);
    expect(t("ago.min", { count: 5 })).toBe("hace 5 min");
  });

  it("falls back to English for an unknown language", () => {
    setLanguage("es");
    expect(setLanguage("fr" as Language)).toBe(true);
    expect(language()).toBe("en");
  });

  it("leaves unknown placeholders as they are", () => {
    expect(t("row.open")).toBe("Open @{user} on Instagram");
  });
});
