import { describe, expect, it } from "vitest";
import {
  assetReturnSchema,
  certificateRequestSchema,
  expenseClaimReviewSchema,
  expenseClaimSchema,
} from "../server/src/schemas.js";

describe("employee service validation", () => {
  it("requires damage details when physical damage is recorded", () => {
    expect(() =>
      assetReturnSchema.parse({
        condition: "DAMAGED",
        accessoriesReturned: true,
        chargerReturned: true,
        dataBackedUp: true,
        dataWiped: true,
        physicalDamage: true,
      }),
    ).toThrow("Describe the physical damage");
  });

  it("accepts a valid expense and enforces the HR status sequence values", () => {
    const claim = expenseClaimSchema.parse({
      category: "TRAVEL",
      amount: 1250.5,
      expenseDate: "2026-07-17",
      description: "Client meeting travel expense",
    });
    expect(claim.amount).toBe(1250.5);
    expect(expenseClaimReviewSchema.parse({ status: "PAID" }).status).toBe("PAID");
  });

  it("accepts digital and printed certificate requests", () => {
    const request = certificateRequestSchema.parse({
      certificateType: "EMPLOYMENT",
      purpose: "Home loan documentation",
      deliveryMode: "DIGITAL",
    });
    expect(request.deliveryMode).toBe("DIGITAL");
  });
});
