import { describe, expect, it } from "vitest";
import { createPurchaseInputSchema, purchasePaymentInputSchema } from "@oil-agency/shared";
import { calculatePurchaseLine } from "./purchase.service.js";

const valid = { supplierId: "supplier-1", supplierInvoice: "SUP-100", purchaseDate: "2026-07-17", dueDate: "2026-08-17", discount: "10.00", tax: "5.00", transportExpense: "20.00", loadingExpense: "0.00", otherExpense: "0.00", paidAmount: "500.00", paymentMethod: "CASH" as const, items: [{ productId: "product-1", batchId: null, batchNumber: "B-100", manufacturingDate: "2026-07-01", expiryDate: "2027-07-01", cartonQuantity: 2, pieceQuantity: 6, purchaseRate: "1200.00" }] };

describe("purchase validation", () => {
  it("accepts a cash, credit, or partial purchase payload", () => expect(createPurchaseInputSchema.safeParse(valid).success).toBe(true));
  it("rejects due dates before purchase date", () => expect(createPurchaseInputSchema.safeParse({ ...valid, dueDate: "2026-07-16" }).success).toBe(false));
  it("rejects expiry before manufacturing date", () => expect(createPurchaseInputSchema.safeParse({ ...valid, items: [{ ...valid.items[0], expiryDate: "2026-06-01" }] }).success).toBe(false));
  it("rejects zero-quantity lines", () => expect(createPurchaseInputSchema.safeParse({ ...valid, items: [{ ...valid.items[0], cartonQuantity: 0, pieceQuantity: 0 }] }).success).toBe(false));
  it("requires a positive-shaped payment amount", () => expect(purchasePaymentInputSchema.safeParse({ amount: "100.00", method: "CASH", paidAt: "2026-07-17" }).success).toBe(true));
});

describe("purchase calculations", () => {
  it("adds exactly 40 tins for 20 trays containing 2 tins each", () => expect(calculatePurchaseLine(20, 0, 2, 550_000)).toMatchObject({ quantityBase: 40, lineTotalMinor: 11_000_000 }));
  it("prices cartons and loose pieces using the carton rate", () => expect(calculatePurchaseLine(2, 6, 12, 120_000)).toEqual({ cartonQuantity: 2, pieceQuantity: 6, quantityBase: 30, purchaseRateMinor: 120_000, unitCostMinor: 10_000, lineTotalMinor: 300_000 }));
  it("uses integer minor units when prorating loose pieces", () => expect(calculatePurchaseLine(0, 1, 3, 100)).toMatchObject({ quantityBase: 1, lineTotalMinor: 33 }));
});
