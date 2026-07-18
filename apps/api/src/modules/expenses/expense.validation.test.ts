import { describe, expect, it } from "vitest";
import { createExpenseInputSchema, expenseListQuerySchema } from "@oil-agency/shared";

describe("expense validation", () => {
  const valid = { categoryId: "cm12345678901234567890123", amount: "1250.50", paymentMethod: "CASH", incurredOn: "2026-07-17", description: "Freight for supplier delivery", reference: "TRUCK-12" };

  it("accepts decimal-safe expense input", () => {
    expect(createExpenseInputSchema.parse(valid).amount).toBe("1250.50");
  });

  it("rejects zero and more than two decimal places", () => {
    expect(createExpenseInputSchema.safeParse({ ...valid, amount: "0.00" }).success).toBe(false);
    expect(createExpenseInputSchema.safeParse({ ...valid, amount: "1.999" }).success).toBe(false);
  });

  it("rejects an inverted report date range", () => {
    expect(expenseListQuerySchema.safeParse({ from: "2026-07-18", to: "2026-07-17" }).success).toBe(false);
  });
});
