import { describe, expect, it } from "vitest";
import {
  decryptEmployeeField,
  encryptEmployeeField,
  lastFour,
} from "../server/src/employeePrivateData.js";

describe("employee private data encryption", () => {
  it("round-trips a value without storing plaintext", () => {
    const encrypted = encryptEmployeeField("123456789012");
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("123456789012");
    expect(decryptEmployeeField(encrypted)).toBe("123456789012");
    expect(lastFour("1234 5678 9012")).toBe("9012");
  });

  it("fails closed when authenticated ciphertext is changed", () => {
    const encrypted = encryptEmployeeField("ABCDE1234F")!;
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    const changedCiphertext = Buffer.from(ciphertext, "base64");
    changedCiphertext[0] ^= 1;
    const tampered = [version, iv, tag, changedCiphertext.toString("base64")].join(".");
    expect(decryptEmployeeField(tampered)).toBeUndefined();
  });

  it("treats blank optional values as absent", () => {
    expect(encryptEmployeeField("  ")).toBeNull();
    expect(lastFour(null)).toBeNull();
  });
});
