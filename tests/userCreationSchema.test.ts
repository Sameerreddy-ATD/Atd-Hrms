import { describe, expect, it } from "vitest";
import { createUserSchema } from "../server/src/schemas.js";

const validAccount = {
  name: "Test Employee",
  email: "employee@example.com",
  password: "Welcome123",
  departmentId: "unit-1",
};

describe("account creation validation", () => {
  it("requires the account creator to provide a temporary password", () => {
    const { password: _password, ...withoutPassword } = validAccount;
    expect(createUserSchema.safeParse(withoutPassword).success).toBe(false);
  });

  it("rejects a weak temporary password", () => {
    expect(createUserSchema.safeParse({ ...validAccount, password: "lowercase1" }).success).toBe(
      false,
    );
  });

  it("accepts a valid account payload", () => {
    const result = createUserSchema.safeParse(validAccount);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.password).toBe("Welcome123");
  });

  it("defaults legacy account creation to Anytime Diesel", () => {
    expect(createUserSchema.parse(validAccount).companyEntity).toBe("ANYTIME_DIESEL");
  });

  it("validates statutory identifiers before persistence", () => {
    expect(
      createUserSchema.safeParse({
        ...validAccount,
        companyEntity: "FUELISTIC_INNOVATIONS_PRIVATE_LIMITED",
        panNumber: "ABCDE1234F",
        aadhaarNumber: "2345 6789 0123",
        uanNumber: "100200300400",
      }).success,
    ).toBe(true);
    expect(createUserSchema.safeParse({ ...validAccount, panNumber: "invalid" }).success).toBe(
      false,
    );
  });
});
