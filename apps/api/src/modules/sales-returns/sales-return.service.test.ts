import { describe, expect, it } from "vitest";
import { createSalesReturnInputSchema } from "@oil-agency/shared";
import { conditionWriteOff, proratedReturnAmount, remainingReturnable } from "./sales-return.service.js";

describe("sales return quantities", () => {
  it("blocks cumulative returns above the sold quantity", () => expect(() => remainingReturnable(12, 8, 5)).toThrowError(expect.objectContaining({ code: "RETURN_QUANTITY_EXCEEDED" })));
  it("allows a partial return up to the remaining quantity", () => expect(remainingReturnable(12, 4, 3)).toBe(5));
  it("assigns rounding remainder to the final return", () => { expect(proratedReturnAmount(100, 3, 0, 0, 1)).toBe(33); expect(proratedReturnAmount(100, 3, 1, 33, 2)).toBe(67); });
});

describe("sales return disposition", () => {
  it("writes opened stock to damaged stock", () => expect(conditionWriteOff("OPENED")).toEqual({ damageType: "DAMAGED", movementType: "DAMAGE" }));
  it("writes expired stock to expired stock", () => expect(conditionWriteOff("EXPIRED")).toEqual({ damageType: "EXPIRED", movementType: "EXPIRY" }));
  it("keeps resalable stock available", () => expect(conditionWriteOff("RESALABLE")).toBeNull());
});

describe("sales return validation", () => {
  it("accepts a partial return with replacement", () => expect(createSalesReturnInputSchema.safeParse({ saleId: "cm12345678901234567890123", reason: "Customer requested exchange", refundMethod: "CASH", items: [{ saleItemId: "cm12345678901234567890124", quantityBase: 2, condition: "RESALABLE" }], replacementItems: [{ productId: "cm12345678901234567890125", unit: "BASE", quantity: 1 }] }).success).toBe(true));
  it("rejects duplicate item-condition rows", () => expect(createSalesReturnInputSchema.safeParse({ saleId: "cm12345678901234567890123", reason: "Duplicate rows", refundMethod: "CASH", items: [{ saleItemId: "cm12345678901234567890124", quantityBase: 1, condition: "DAMAGED" }, { saleItemId: "cm12345678901234567890124", quantityBase: 1, condition: "DAMAGED" }] }).success).toBe(false));
});
