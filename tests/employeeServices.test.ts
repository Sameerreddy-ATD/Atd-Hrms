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
      claimType: "EXPENSE",
      title: "Client travel",
      amount: 1250.5,
      expenseDate: "2026-07-17",
      description: "Client meeting travel expense",
      receiptUrl: "https://drive.google.com/file/d/example/view",
      receiptAccessConfirmed: true,
    });
    expect(claim.amount).toBe(1250.5);
    expect(expenseClaimReviewSchema.parse({ status: "UNPAID" }).status).toBe("UNPAID");
    expect(expenseClaimReviewSchema.parse({ status: "PAID" }).status).toBe("PAID");
  });

  it("accepts an advance expense with only amount and remark", () => {
    const advance = expenseClaimSchema.parse({
      claimType: "ADVANCE",
      amount: 5000,
      remark: "Advance for the upcoming customer visit",
    });
    expect(advance.claimType).toBe("ADVANCE");
    expect(advance.expenseDate).toBeUndefined();
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
