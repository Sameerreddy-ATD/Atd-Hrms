import { describe, expect, it } from "vitest";
import { changePasswordSchema, resetTestDataSchema } from "../server/src/schemas.js";

describe("security workflow validation", () => {
  it("allows first-login password changes without storing the temporary password", () => {
    expect(changePasswordSchema.safeParse({ nextPassword: "NewPassword123" }).success).toBe(true);
  });

  it("rejects weak replacement passwords", () => {
    expect(changePasswordSchema.safeParse({ nextPassword: "weakpass" }).success).toBe(false);
  });

  it("requires the exact destructive reset phrase and a password", () => {
    expect(
      resetTestDataSchema.safeParse({
        confirmation: "DELETE ALL TEST DATA",
        password: "admin-password",
      }).success,
    ).toBe(true);
    expect(
      resetTestDataSchema.safeParse({ confirmation: "DELETE", password: "admin-password" }).success,
    ).toBe(false);
    expect(
      resetTestDataSchema.safeParse({ confirmation: "DELETE ALL TEST DATA", password: "" }).success,
    ).toBe(false);
  });
});
