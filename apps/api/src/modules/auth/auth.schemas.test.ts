import { describe, expect, it } from "vitest";
import { createUserInputSchema, loginInputSchema, resetPasswordInputSchema } from "@oil-agency/shared";

describe("authentication input schemas", () => {
  it("normalizes usernames", () => {
    expect(loginInputSchema.parse({ username: "  OWNER  ", password: "ChangeMe123!" }).username).toBe("owner");
  });

  it("rejects weak staff passwords", () => {
    const result = createUserInputSchema.safeParse({ username: "cashier", displayName: "Cashier", password: "password", roleCode: "CASHIER", cashierDiscountLimitBps: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts a strong password reset", () => {
    expect(resetPasswordInputSchema.safeParse({ password: "NewPassword123" }).success).toBe(true);
  });
});
