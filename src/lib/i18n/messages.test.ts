import { describe, expect, it } from "vitest";
import { messages, normalizeLocale } from "./messages";

describe("i18n", () => {
  it("has the same keys in English and Estonian", () => {
    expect(Object.keys(messages.et).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("falls back to English for unknown locales", () => {
    expect(normalizeLocale("fi")).toBe("en");
    expect(normalizeLocale("et")).toBe("et");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});
