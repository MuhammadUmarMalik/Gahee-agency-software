import { describe, expect, it, vi } from "vitest";
import type { PrismaClient, ProductBatch } from "@prisma/client";
import { checkoutInputSchema } from "@oil-agency/shared";
import { allocateFefoStock, calculateInvoiceBalances, calculateSaleTotals, SaleService } from "./sale.service.js";

const batch = (id: string, expiry: string | null, stock: number, created = "2026-01-01"): ProductBatch => ({ id, productId: "p1", batchNumber: id, manufactureDate: null, expiryDate: expiry ? new Date(expiry) : null, purchasePriceMinor: 100, stockOnHandBaseQty: stock, createdAt: new Date(created), updatedAt: new Date(created) });
describe("POS totals", () => { it("applies discount before automatic product tax", () => expect(calculateSaleTotals([{ grossMinor: 10_000, taxRateBps: 1_800 }], 1_000)).toEqual({ subtotalMinor: 10_000, discountMinor: 1_000, taxMinor: 1_620, totalMinor: 10_620 })); });
describe("FEFO allocation", () => {
  it("uses the earliest non-expired batch first", () => { const result = allocateFefoStock("Oil", 20, [batch("later", "2027-12-01", 10), batch("first", "2027-01-01", 10)], 12, new Date("2026-07-17")); expect(result.map((row) => [row.batch?.id, row.quantity])).toEqual([["first", 10], ["later", 2]]); });
  it("excludes expired stock and blocks a negative available balance", () => expect(() => allocateFefoStock("Oil", 10, [batch("expired", "2025-01-01", 10)], 1, new Date("2026-07-17"))).toThrowError(expect.objectContaining({ code: "NEGATIVE_STOCK" })));
  it("allocates non-batch stock only after dated batches", () => { const result = allocateFefoStock("Oil", 10, [batch("dated", "2027-01-01", 4)], 6, new Date("2026-07-17")); expect(result.map((row) => [row.batch?.id ?? null, row.quantity])).toEqual([["dated", 4], [null, 2]]); });
});
describe("checkout validation", () => { it("accepts mixed payments", () => expect(checkoutInputSchema.safeParse({ customerId: "c1", saleType: "RETAIL", items: [{ productId: "p1", unit: "PACK", quantity: 2 }], discountBps: 0, payments: [{ method: "CASH", amount: "100.00" }, { method: "CARD", amount: "50.00" }] }).success).toBe(true)); });
describe("invoice balance snapshots", () => { it("preserves the previous balance and adds only this invoice due", () => expect(calculateInvoiceBalances(12_500, 2_750)).toEqual({ previousBalanceMinor: 12_500, currentBalanceMinor: 15_250 })); it("does not change the balance for a fully paid invoice", () => expect(calculateInvoiceBalances(12_500, 0)).toEqual({ previousBalanceMinor: 12_500, currentBalanceMinor: 12_500 })); });
describe("POS product visibility", () => {
  it("returns an active product with expired-only stock as unavailable instead of hiding it", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "p1", name: "Expired Oil", sku: "OIL-1", barcode: "123", category: { id: "c1", name: "Oil" }, baseUnit: { symbol: "btl" }, packings: [{ name: "Carton", unitsPerPack: 12, unit: { symbol: "ctn" } }], batches: [batch("old", "2000-01-01", 5)], stockOnHandBaseQty: 5, retailPriceMinor: 500, wholesalePriceMinor: 450, taxRateBps: 0 }]);
    const service = new SaleService({ product: { findMany } } as unknown as PrismaClient);
    const products = await service.search("");
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ stockBaseQty: 5, availableBaseQty: 0, expiredBaseQty: 5, suggestedBatch: null });
  });
});
