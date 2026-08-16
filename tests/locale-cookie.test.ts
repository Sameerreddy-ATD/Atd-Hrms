import { describe, expect, it } from "vitest";
import { readLocaleCookie } from "../src/i18n/index.js";

/**
 * The server picks the render language from this cookie, so a parsing slip
 * silently drops every reader back to English.
 */
describe("locale cookie", () => {
  it("finds the locale wherever it sits in the header", () => {
    expect(readLocaleCookie("atd-locale=te")).toBe("te");
    expect(readLocaleCookie("theme=dark; atd-locale=hi; session=abc")).toBe("hi");
    expect(readLocaleCookie("atd-locale=en; theme=light")).toBe("en");
  });

  it("tolerates the spacing and encoding browsers actually send", () => {
    expect(readLocaleCookie("theme=dark;atd-locale=te")).toBe("te");
    expect(readLocaleCookie("  atd-locale = te ")).toBe("te");
    expect(readLocaleCookie("atd-locale=%74%65")).toBe("te");
  });

  it("refuses anything that is not a supported language", () => {
    expect(readLocaleCookie("atd-locale=fr")).toBe(null);
    expect(readLocaleCookie("atd-locale=")).toBe(null);
    expect(readLocaleCookie("other-locale=te")).toBe(null);
    expect(readLocaleCookie("")).toBe(null);
    expect(readLocaleCookie(null)).toBe(null);
    expect(readLocaleCookie(undefined)).toBe(null);
  });

  it("does not match a cookie whose name merely ends with the key", () => {
    expect(readLocaleCookie("not-atd-locale=te")).toBe(null);
  });
});
