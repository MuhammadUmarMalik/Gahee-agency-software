import { describe, expect, it, vi } from "vitest";
import type { AppDbClient, TransactionClient, PaymentMethod, SourceType, StockMovementType, BackupKind, JobType, JobStatus, CashDirection, CashbookEntryType, ReturnCondition } from "../../lib/db.js";
import { checkoutInputSchema, FBR_INTEGRATION_ENABLED, saleListQuerySchema, updateSaleMetadataInputSchema } from "@oil-agency/shared";
import { allocateFefoStock, calculateInvoiceBalances, calculateSaleTotals, SaleService, type ProductBatch } from "./sale.service.js";

const batch = (id: string, expiry: string | null, stock: number, created = "2026-01-01"): ProductBatch => ({ id, productId: "p1", batchNumber: id, manufactureDate: null, expiryDate: expiry ? new Date(expiry) : null, purchasePriceMinor: 100, stockOnHandBaseQty: stock, createdAt: new Date(created), updatedAt: new Date(created) });
describe("POS totals", () => { it("applies discount before automatic product tax", () => expect(calculateSaleTotals([{ grossMinor: 10_000, taxRateBps: 1_800 }], 1_000)).toEqual({ subtotalMinor: 10_000, discountMinor: 1_000, taxMinor: 1_620, totalMinor: 10_620 })); });
describe("FEFO allocation", () => {
  it("uses the earliest non-expired batch first", () => { const result = allocateFefoStock("Oil", 20, [batch("later", "2027-12-01", 10), batch("first", "2027-01-01", 10)], 12, new Date("2026-07-17")); expect(result.map((row) => [row.batch?.id, row.quantity])).toEqual([["first", 10], ["later", 2]]); });
  it("excludes expired stock and blocks a negative available balance", () => expect(() => allocateFefoStock("Oil", 10, [batch("expired", "2025-01-01", 10)], 1, new Date("2026-07-17"))).toThrowError(expect.objectContaining({ code: "NEGATIVE_STOCK" })));
  it("allocates non-batch stock only after dated batches", () => { const result = allocateFefoStock("Oil", 10, [batch("dated", "2027-01-01", 4)], 6, new Date("2026-07-17")); expect(result.map((row) => [row.batch?.id ?? null, row.quantity])).toEqual([["dated", 4], [null, 2]]); });
});
describe("checkout validation", () => { it("accepts mixed payments", () => expect(checkoutInputSchema.safeParse({ customerId: "c1", saleType: "RETAIL", items: [{ productId: "p1", unit: "PACK", quantity: 2 }], discountBps: 0, payments: [{ method: "CASH", amount: "100.00" }, { method: "CARD", amount: "50.00" }] }).success).toBe(true)); });
describe("FBR feature switch", () => {
  it("is enabled so manual submission reaches the FBR workflow", () => {
    expect(FBR_INTEGRATION_ENABLED).toBe(true);
  });
});
describe("sales management validation", () => {
  it("normalizes list defaults and pagination", () => expect(saleListQuerySchema.parse({ search: "  SAL-100  ", page: "2" })).toMatchObject({ search: "SAL-100", status: "ALL", page: 2, pageSize: 50 }));
  it("rejects a reversed date range", () => expect(saleListQuerySchema.safeParse({ from: "2026-07-20", to: "2026-07-19" }).success).toBe(false));
  it("limits editable sale data to an optional note", () => { expect(updateSaleMetadataInputSchema.parse({ notes: "  delivery note  " })).toEqual({ notes: "delivery note" }); expect(updateSaleMetadataInputSchema.safeParse({ notes: "x".repeat(1001) }).success).toBe(false); });
});
describe("invoice balance snapshots", () => { it("preserves the previous balance and adds only this invoice due", () => expect(calculateInvoiceBalances(12_500, 2_750)).toEqual({ previousBalanceMinor: 12_500, currentBalanceMinor: 15_250 })); it("does not change the balance for a fully paid invoice", () => expect(calculateInvoiceBalances(12_500, 0)).toEqual({ previousBalanceMinor: 12_500, currentBalanceMinor: 12_500 })); });
describe("POS product visibility", () => {
  it("returns an active product with expired-only stock as unavailable instead of hiding it", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "p1", name: "Expired Oil", sku: "OIL-1", barcode: "123", category: { id: "c1", name: "Oil" }, baseUnit: { symbol: "btl" }, packings: [{ name: "Carton", unitsPerPack: 12, unit: { symbol: "ctn" } }], batches: [batch("old", "2000-01-01", 5)], stockOnHandBaseQty: 5, retailPriceMinor: 500, wholesalePriceMinor: 450, taxRateBps: 0 }]);
    const service = new SaleService({ product: { findMany } } as unknown as AppDbClient);
    const products = await service.search("");
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ stockBaseQty: 5, availableBaseQty: 0, expiredBaseQty: 5, suggestedBatch: null });
  });
});
describe("sales management list", () => {
  it("returns money-safe display values and pagination", async () => {
    const sale = { id: "s1", invoiceNumber: "SAL-1", soldAt: new Date("2026-07-19"), saleType: "RETAIL", status: "POSTED", paymentStatus: "PARTIAL", subtotalMinor: 10_000, discountMinor: 500, taxMinor: 0, totalMinor: 9_500, paidMinor: 4_000, notes: null, fbrStatus: "PENDING", fbrInvoiceNumber: null, customer: { id: "c1", code: "CUS-1", name: "Buyer", businessName: null, phone: null }, createdBy: { displayName: "Cashier" }, _count: { items: 1, payments: 1, returns: 0 } };
    const findMany = vi.fn().mockResolvedValue([sale]); const count = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn().mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations));
    const service = new SaleService({ sale: { findMany, count }, $transaction: transaction } as unknown as AppDbClient);
    const result = await service.list(saleListQuerySchema.parse({ search: "SAL-1" }));
    expect(result.sales[0]).toMatchObject({ invoiceNumber: "SAL-1", total: "95.00", paid: "40.00", due: "55.00" });
    expect(result.pagination).toEqual({ page: 1, pageSize: 50, total: 1, pages: 1 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }));
  });
});
