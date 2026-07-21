import { describe, expect, it } from "vitest";
import { createUserInputSchema, loginInputSchema, resetPasswordInputSchema, setupOwnerInputSchema } from "@oil-agency/shared";

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

  it("requires matching first-run password and PIN confirmation", () => {
    const base = { username: "owner", displayName: "Business Owner", password: "StrongOwner123", confirmPassword: "StrongOwner123", ownerPin: "4827", confirmOwnerPin: "4827" };
    expect(setupOwnerInputSchema.safeParse(base).success).toBe(true);
    expect(setupOwnerInputSchema.safeParse({ ...base, confirmPassword: "Different123" }).success).toBe(false);
    expect(setupOwnerInputSchema.safeParse({ ...base, confirmOwnerPin: "1111" }).success).toBe(false);
  });
});
