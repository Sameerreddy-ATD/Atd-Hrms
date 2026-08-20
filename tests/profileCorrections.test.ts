import { describe, expect, it } from "vitest";
import { decryptEmployeeField } from "../server/src/employeePrivateData.js";
import { HttpError } from "../server/src/errors.js";
import { buildProfileCorrectionUpdate } from "../server/src/profileCorrections.js";

describe("buildProfileCorrectionUpdate", () => {
  it("encrypts bank, PAN, Aadhaar, and UAN instead of storing plaintext", () => {
    const bank = buildProfileCorrectionUpdate("bankAccountNumber", "123456789012");
    expect(bank.column).toBe("bankAccountNumberEncrypted");
    expect(bank.data.bankAccountNumberEncrypted).toMatch(/^v1\./);
    expect(String(bank.data.bankAccountNumberEncrypted)).not.toContain("123456789012");
    expect(decryptEmployeeField(bank.data.bankAccountNumberEncrypted as string)).toBe("123456789012");
    expect(bank.data.bankAccountNumberLast4).toBe("9012");

    const pan = buildProfileCorrectionUpdate("panNumber", "ABCDE1234F");
    expect(pan.data.panNumberEncrypted).toMatch(/^v1\./);
    expect(pan.data.panNumberLast4).toBe("234F");
  });

  it("syncs name, email, and phone onto the login row", () => {
    expect(buildProfileCorrectionUpdate("name", "Priya Reddy").userColumn).toBe("name");
    const email = buildProfileCorrectionUpdate("companyEmail", "Priya@Anytime-Diesel.com");
    expect(email.column).toBe("email");
    expect(email.data.email).toBe("priya@anytime-diesel.com");
    expect(email.userColumn).toBe("email");
    expect(email.uniqueValue).toBe("priya@anytime-diesel.com");
    expect(buildProfileCorrectionUpdate("phone", "9876543210").userColumn).toBe("phone");
  });

  it("normalizes enums and rejects unknown values", () => {
    expect(buildProfileCorrectionUpdate("gender", "male").data.gender).toBe("MALE");
    expect(buildProfileCorrectionUpdate("employmentType", "full time").data.employmentType).toBe(
      "FULL_TIME",
    );
    expect(() => buildProfileCorrectionUpdate("gender", "unknown")).toThrow(HttpError);
  });

  it("rejects unmapped fields, empty values, and invalid dates", () => {
    expect(() => buildProfileCorrectionUpdate("emergencyPhone", "999")).toThrow(HttpError);
    expect(() => buildProfileCorrectionUpdate("name", "   ")).toThrow(HttpError);
    expect(() => buildProfileCorrectionUpdate("dateOfBirth", "not-a-date")).toThrow(HttpError);
    const dob = buildProfileCorrectionUpdate("dateOfBirth", "1998-04-12");
    expect(dob.data.dateOfBirth).toBeInstanceOf(Date);
    expect(Number.isNaN((dob.data.dateOfBirth as Date).getTime())).toBe(false);
  });
});
