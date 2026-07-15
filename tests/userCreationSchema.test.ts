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
});
