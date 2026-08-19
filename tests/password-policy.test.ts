import { describe, expect, it } from "vitest";
import { passwordMeetsPolicy, PASSWORD_MIN_LENGTH } from "../src/lib/password-policy";

describe("passwordMeetsPolicy", () => {
  it("requires 10+ chars, uppercase, and number", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(passwordMeetsPolicy("short1A")).toBe(false);
    expect(passwordMeetsPolicy("nouppercase1")).toBe(false);
    expect(passwordMeetsPolicy("NoNumbers")).toBe(false);
    expect(passwordMeetsPolicy("ValidPass1")).toBe(true);
  });
});
