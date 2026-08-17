import { describe, expect, it } from "vitest";
import {
  isEmailIdentifier,
  isPhoneIdentifier,
  isPhonePlaceholderEmail,
  normalizePhoneDigits,
  phoneLookupVariants,
  phonePlaceholderEmail,
} from "../server/src/phone.js";

describe("phone login helpers", () => {
  it("normalises Indian mobile variants to 10 digits", () => {
    expect(normalizePhoneDigits("98765 43210")).toBe("9876543210");
    expect(normalizePhoneDigits("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhoneDigits("919876543210")).toBe("9876543210");
    expect(normalizePhoneDigits("09876543210")).toBe("9876543210");
  });

  it("detects email vs phone identifiers", () => {
    expect(isEmailIdentifier("driver@anytimediesel.com")).toBe(true);
    expect(isPhoneIdentifier("9876543210")).toBe(true);
    expect(isPhoneIdentifier("+91 98765 43210")).toBe(true);
    expect(isPhoneIdentifier("short")).toBe(false);
  });

  it("builds a non-routable placeholder email for phone-only accounts", () => {
    expect(phonePlaceholderEmail("9876543210")).toBe("m9876543210@phone.atd.local");
    expect(isPhonePlaceholderEmail("m9876543210@phone.atd.local")).toBe(true);
    expect(isPhonePlaceholderEmail("hr@anytimediesel.com")).toBe(false);
  });

  it("lists lookup variants for saved phones that were not normalised", () => {
    expect(phoneLookupVariants("9876543210")).toEqual(
      expect.arrayContaining(["9876543210", "+919876543210", "919876543210", "09876543210"]),
    );
  });
});
